import { NextResponse } from "next/server";

import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = {
  actor_id?: string;
  full_name?: string;
  login_id?: string;
  role?: string;
  is_active?: boolean;
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

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("id, staff_id, full_name, role, login_id, is_active")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "duplicate_login" }, { status: 409 });
      }
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ user: data });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
