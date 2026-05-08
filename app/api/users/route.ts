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

export async function GET(request: Request) {
  const actorId = request.headers.get("x-actor-id");
  if (!(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, staff_id, full_name, role, login_id, is_active")
      .order("staff_id", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }

    return NextResponse.json({ users: data ?? [] });
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

  if (!fullName || !role || !["ops", "staff", "vendor"].includes(role) || !/^\d{10}$/.test(loginId)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
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

    return NextResponse.json({ user: inserted });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
