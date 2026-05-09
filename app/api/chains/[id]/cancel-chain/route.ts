import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  reason?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: chainId } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const reason = (body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "missing_reason" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: chain } = await supabase.from("task_chains").select("id, status").eq("id", chainId).maybeSingle();
  if (!chain) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (chain.status === "completed" || chain.status === "cancelled") {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data: steps } = await supabase.from("task_chain_steps").select("task_id").eq("chain_id", chainId);
  const taskIds = [...new Set((steps ?? []).map((s) => s.task_id).filter(Boolean))] as string[];

  for (const tid of taskIds) {
    const { data: t } = await supabase.from("tasks").select("status").eq("id", tid).maybeSingle();
    if (!t) continue;
    if (t.status !== "pending" && t.status !== "waiting") continue;

    await supabase
      .from("tasks")
      .update({
        status: "cancelled",
        cancel_reason: reason,
        cancelled_by: actorId,
        cancelled_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", tid);

    await supabase.from("task_events").insert({
      task_id: tid,
      actor_id: actorId!,
      event_type: "cancelled",
      old_value: t.status as string,
      new_value: "cancelled",
      note: reason,
    });
  }

  await supabase.from("task_chains").update({ status: "cancelled" }).eq("id", chainId);

  const { data: chainOut } = await supabase.from("task_chains").select("*").eq("id", chainId).single();
  return NextResponse.json({ chain: chainOut });
}
