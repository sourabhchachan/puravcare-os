import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { advanceVerticalChainFromStepOrder } from "@/lib/chains/onTaskClose";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  step_id?: string;
  reason?: string;
};

async function insertEvent(
  supabase: ReturnType<typeof createServiceClient>,
  row: { task_id: string; actor_id: string; event_type: string; old_value: string | null; new_value: string | null; note?: string | null },
) {
  await supabase.from("task_events").insert({
    task_id: row.task_id,
    actor_id: row.actor_id,
    event_type: row.event_type,
    old_value: row.old_value,
    new_value: row.new_value,
    note: row.note ?? null,
  });
}

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

  const stepId = (body.step_id ?? "").trim();
  const reason = (body.reason ?? "").trim();
  if (!stepId) return NextResponse.json({ error: "missing_step" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "missing_reason" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: chain } = await supabase.from("task_chains").select("*").eq("id", chainId).maybeSingle();
  if (!chain) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (chain.chain_type !== "vertical") return NextResponse.json({ error: "vertical_only" }, { status: 400 });
  if (!["active", "paused", "approved"].includes(chain.status as string)) {
    return NextResponse.json({ error: "invalid_chain_state" }, { status: 400 });
  }

  const { data: step } = await supabase
    .from("task_chain_steps")
    .select("id, chain_id, step_order, status, task_id")
    .eq("id", stepId)
    .eq("chain_id", chainId)
    .maybeSingle();
  if (!step || !step.task_id) return NextResponse.json({ error: "step_not_found" }, { status: 404 });

  if (step.status !== "active") return NextResponse.json({ error: "step_not_active" }, { status: 400 });

  const { data: task } = await supabase.from("tasks").select("id, status").eq("id", step.task_id).maybeSingle();
  if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });
  if (task.status !== "blocked") return NextResponse.json({ error: "task_not_blocked" }, { status: 400 });

  const nowIso = new Date().toISOString();

  await supabase
    .from("task_chain_steps")
    .update({ status: "skipped", skip_reason: reason })
    .eq("id", step.id);

  await supabase.from("tasks").update({ status: "closed", updated_at: nowIso }).eq("id", task.id);

  await insertEvent(supabase, {
    task_id: task.id as string,
    actor_id: actorId!,
    event_type: "force_skipped",
    old_value: "blocked",
    new_value: "closed",
    note: reason,
  });
  await insertEvent(supabase, {
    task_id: task.id as string,
    actor_id: actorId!,
    event_type: "status_changed",
    old_value: "blocked",
    new_value: "closed",
    note: "force_skipped",
  });

  await advanceVerticalChainFromStepOrder(supabase, chainId, step.step_order as number);

  const { data: chainOut } = await supabase.from("task_chains").select("*").eq("id", chainId).single();
  return NextResponse.json({ chain: chainOut });
}
