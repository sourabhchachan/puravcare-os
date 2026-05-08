import { NextResponse } from "next/server";

import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = {
  actor_id?: string;
  full_name?: string;
  login_id?: string;
  role?: string;
  is_active?: boolean;
  can_create_tasks?: boolean;
  can_create_items?: boolean;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = await params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!(await assertCeo(body.actor_id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!userId) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  if (body.actor_id === userId && body.is_active === false) {
    return NextResponse.json({ error: "cannot_deactivate_self" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: existing, error: exErr } = await supabase
    .from("users")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (exErr || !existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.full_name === "string") updates.full_name = body.full_name.trim();
  if (typeof body.login_id === "string") {
    const lid = body.login_id.trim();
    if (!/^\d{10}$/.test(lid)) {
      return NextResponse.json({ error: "invalid_login" }, { status: 400 });
    }
    updates.login_id = lid;
  }
  if (typeof body.role === "string") {
    if (!["ceo", "ops", "staff", "vendor"].includes(body.role)) {
      return NextResponse.json({ error: "invalid_role" }, { status: 400 });
    }
    updates.role = body.role;
  }
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

  const finalRole = (updates.role as string | undefined) ?? (existing.role as string);
  const finalActive = (updates.is_active as boolean | undefined) ?? (existing.is_active as boolean);

  if (finalRole === "ceo" && finalActive) {
    const { count, error: cErr } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "ceo")
      .eq("is_active", true)
      .neq("id", userId);

    if (cErr) {
      return NextResponse.json({ error: "count_failed" }, { status: 500 });
    }
    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: "too_many_ceos" }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 0 && typeof body.can_create_tasks !== "boolean" && typeof body.can_create_items !== "boolean") {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  try {
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("users").update(updates).eq("id", userId);
      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "duplicate_login" }, { status: 409 });
        }
        return NextResponse.json({ error: "update_failed" }, { status: 500 });
      }
    }

    if (
      (finalRole === "ops" || finalRole === "staff") &&
      (typeof body.can_create_tasks === "boolean" || typeof body.can_create_items === "boolean")
    ) {
      const { data: prow } = await supabase
        .from("permissions")
        .select("id, can_create_tasks, can_create_items")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      const nextTasks = typeof body.can_create_tasks === "boolean" ? body.can_create_tasks : Boolean(prow?.can_create_tasks);
      const nextItems = typeof body.can_create_items === "boolean" ? body.can_create_items : Boolean(prow?.can_create_items);

      if (prow?.id) {
        const { error: pErr } = await supabase
          .from("permissions")
          .update({ can_create_tasks: nextTasks, can_create_items: nextItems })
          .eq("id", prow.id);
        if (pErr) return NextResponse.json({ error: "permissions_update_failed" }, { status: 500 });
      } else {
        const { error: pErr } = await supabase.from("permissions").insert({
          user_id: userId,
          can_create_tasks: nextTasks,
          can_create_items: nextItems,
        });
        if (pErr) return NextResponse.json({ error: "permissions_insert_failed" }, { status: 500 });
      }
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, staff_id, full_name, role, login_id, is_active")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }

    const { data: permRow } = await supabase
      .from("permissions")
      .select("can_create_tasks, can_create_items")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      user: {
        ...data,
        permissions: permRow
          ? { can_create_tasks: permRow.can_create_tasks, can_create_items: permRow.can_create_items }
          : null,
      },
    });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
