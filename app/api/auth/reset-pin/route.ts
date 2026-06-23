import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { canResetPin } from "@/lib/api/pin";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  user_id?: string;
};

export async function PATCH(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await canResetPin(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const targetUserId = (body.user_id ?? "").trim();
  if (!targetUserId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: target, error: fetchErr } = await supabase
    .from("users")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (fetchErr || !target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update({
      password_hash: "000000",
      must_change_password: true,
    })
    .eq("id", targetUserId);

  if (updateErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
