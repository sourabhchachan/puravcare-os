import { NextResponse } from "next/server";

import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

function nextStaffId(rows: { staff_id: string }[] | null) {
  const nums = (rows ?? [])
    .map((r) => parseInt(r.staff_id, 10))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 100000;
  return String(max + 1);
}

function mergePermissions(
  users: { id: string }[],
  perms: { user_id: string; can_create_tasks: boolean; can_create_items: boolean }[] | null,
) {
  const map = new Map<string, { can_create_tasks: boolean; can_create_items: boolean }>();
  for (const p of perms ?? []) {
    if (!map.has(p.user_id)) {
      map.set(p.user_id, { can_create_tasks: p.can_create_tasks, can_create_items: p.can_create_items });
    }
  }
  return (users ?? []).map((u) => ({
    ...u,
    permissions: map.get(u.id) ?? null,
  }));
}

export async function GET(request: Request) {
  const actorId = request.headers.get("x-actor-id");
  if (!(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = createServiceClient();
    const { data: users, error } = await supabase
      .from("users")
      .select("id, staff_id, full_name, role, login_id, is_active")
      .order("staff_id", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }

    const ids = (users ?? []).map((u) => u.id);
    let perms: { user_id: string; can_create_tasks: boolean; can_create_items: boolean }[] | null = [];
    if (ids.length) {
      const res = await supabase.from("permissions").select("user_id, can_create_tasks, can_create_items").in("user_id", ids);
      perms = res.data as typeof perms;
    }

    return NextResponse.json({ users: mergePermissions(users ?? [], perms) });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

type CreateBody = {
  actor_id?: string;
  full_name?: string;
  role?: string;
  login_id?: string;
};

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!(await assertCeo(body.actor_id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const fullName = (body.full_name ?? "").trim();
  const role = body.role;
  const loginId = (body.login_id ?? "").trim();

  if (!fullName || !role || !["ceo", "ops", "staff", "vendor"].includes(role) || !/^\d{10}$/.test(loginId)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();

    if (role === "ceo") {
      const { count, error: countError } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "ceo")
        .eq("is_active", true);
      if (countError) {
        return NextResponse.json({ error: "count_failed" }, { status: 500 });
      }
      if ((count ?? 0) >= 5) {
        return NextResponse.json({ error: "too_many_ceos" }, { status: 400 });
      }
    }

    const { data: staffRows, error: staffError } = await supabase.from("users").select("staff_id");
    if (staffError) {
      return NextResponse.json({ error: "staff_fetch_failed" }, { status: 500 });
    }

    const staffId = nextStaffId(staffRows);

    const { data: inserted, error: insertError } = await supabase
      .from("users")
      .insert({
        staff_id: staffId,
        login_id: loginId,
        password_hash: "000000",
        must_change_password: true,
        full_name: fullName,
        role,
        is_active: true,
      })
      .select("id, staff_id, full_name, role, login_id, is_active")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "duplicate_login" }, { status: 409 });
      }
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    if (!inserted) {
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    const { error: permError } = await supabase.from("permissions").insert({
      user_id: inserted.id as string,
      can_create_tasks: false,
      can_create_items: false,
    });

    if (permError) {
      await supabase.from("users").delete().eq("id", inserted.id as string);
      return NextResponse.json({ error: "permissions_insert_failed" }, { status: 500 });
    }

    return NextResponse.json({
      user: {
        ...inserted,
        permissions: { can_create_tasks: false, can_create_items: false },
      },
    });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
