import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  current_pin?: string;
  new_pin?: string;
};

function validateNewPin(pin: string) {
  return /^\d{6}$/.test(pin) && pin !== "000000";
}

export async function PATCH(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const currentPin = body.current_pin ?? "";
  const newPin = body.new_pin ?? "";

  if (!/^\d{6}$/.test(currentPin)) {
    return NextResponse.json({ error: "invalid_current_pin" }, { status: 400 });
  }
  if (!validateNewPin(newPin)) {
    return NextResponse.json({ error: "invalid_new_pin" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: user, error: fetchErr } = await supabase
    .from("users")
    .select("id, password_hash")
    .eq("id", actorId!)
    .maybeSingle();

  if (fetchErr || !user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (user.password_hash !== currentPin) {
    return NextResponse.json({ error: "wrong_pin" }, { status: 403 });
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update({
      password_hash: newPin,
      must_change_password: false,
    })
    .eq("id", actorId!);

  if (updateErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
