import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  user_id?: string;
  new_password?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const userId = body.user_id?.trim();
  const newPassword = body.new_password ?? "";

  if (!userId || !/^\d{6}$/.test(newPassword) || newPassword === "000000") {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { data: existing, error: fetchError } = await supabase
      .from("users")
      .select("id, must_change_password")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (!existing.must_change_password) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({
        password_hash: newPassword,
        must_change_password: false,
      })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
