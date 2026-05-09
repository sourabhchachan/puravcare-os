import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  login_id?: string;
  password?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const loginId = (body.login_id ?? "").trim();
  const password = body.password ?? "";

  if (!/^\d{10}$/.test(loginId) || !/^\d{6}$/.test(password)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("id, staff_id, full_name, role, login_id, password_hash, must_change_password, is_active")
      .eq("login_id", loginId)
      .maybeSingle();

    if (error || !user) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    if (!user.is_active) {
      return NextResponse.json({ error: "deactivated" }, { status: 403 });
    }

    if (user.password_hash !== password) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    const { data: perm } = await supabase
      .from("permissions")
      .select("can_create_tasks, can_create_items")
      .eq("user_id", user.id as string)
      .maybeSingle();

    const session = {
      id: user.id as string,
      staff_id: user.staff_id as string,
      full_name: user.full_name as string,
      role: user.role as "ceo" | "ops" | "staff" | "vendor",
      login_id: user.login_id as string,
      must_change_password: Boolean(user.must_change_password),
      can_create_tasks: perm ? perm.can_create_tasks !== false : true,
      can_create_items: Boolean(perm?.can_create_items),
    };

    return NextResponse.json({ user: session });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
