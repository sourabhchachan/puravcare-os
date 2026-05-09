import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = { is_active?: boolean };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: updated, error } = await supabase
    .from("payment_methods")
    .update({ is_active: body.is_active })
    .eq("id", id)
    .select("id, name, is_active, created_at")
    .maybeSingle();

  if (error || !updated) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ payment_method: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("cash_entries")
    .select("id", { count: "exact", head: true })
    .eq("payment_method_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "in_use" }, { status: 400 });
  }

  const { error } = await supabase.from("payment_methods").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
