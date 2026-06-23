import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { canManageMrd } from "@/lib/mrd/access";
import { insertMrdTransaction } from "@/lib/mrd/transactions";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = { action?: string };

const FILE_ACTIONS = {
  mark_received: { from: "missing", to: "in_mrd", txn: "mark_received" },
  send_to_insurance: { from: "in_mrd", to: "with_insurance", txn: "send_to_insurance" },
  return_from_insurance: { from: "with_insurance", to: "in_mrd", txn: "return_from_insurance" },
} as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await canManageMrd(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = body.action as keyof typeof FILE_ACTIONS | undefined;
  if (!action || !(action in FILE_ACTIONS)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const spec = FILE_ACTIONS[action];
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: file } = await supabase.from("mrd_files").select("id, status").eq("id", id).maybeSingle();
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (file.status !== spec.from) {
    return NextResponse.json({ error: "invalid_status", current: file.status }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("mrd_files")
    .update({ status: spec.to, updated_at: now })
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  try {
    await insertMrdTransaction(supabase, {
      file_id: id,
      action: spec.txn,
      from_status: spec.from,
      to_status: spec.to,
      actor_id: actorId,
    });
  } catch {
    return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: spec.to });
}
