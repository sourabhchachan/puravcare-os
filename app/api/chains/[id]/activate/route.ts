import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { createServiceClient } from "@/lib/supabase/service";
import { insertTaskFromMaster } from "@/lib/tasks/insertTaskFromMaster";

type StepPayload = {
  step_id?: string;
  assignee_id?: string;
  due_at?: string;
  patient_id?: string | null;
};

type Body = {
  steps?: StepPayload[];
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: chainId } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeoOrOps(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const stepPayloads = Array.isArray(body.steps) ? body.steps : [];
  const byStepId = new Map<string, StepPayload>();
  for (const p of stepPayloads) {
    const sid = (p.step_id ?? "").trim();
    if (sid) byStepId.set(sid, p);
  }

  const supabase = createServiceClient();
  const { data: chain, error: cErr } = await supabase.from("task_chains").select("*").eq("id", chainId).maybeSingle();
  if (cErr || !chain) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (chain.status !== "approved") {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  const { data: steps } = await supabase
    .from("task_chain_steps")
    .select("*")
    .eq("chain_id", chainId)
    .order("step_order", { ascending: true });

  const list = steps ?? [];
  if (!list.length) return NextResponse.json({ error: "no_steps" }, { status: 400 });
  if (list.some((s) => s.task_id)) {
    return NextResponse.json({ error: "already_activated" }, { status: 400 });
  }
  if (byStepId.size !== list.length) {
    return NextResponse.json({ error: "steps_mismatch" }, { status: 400 });
  }

  for (const st of list) {
    const payload = byStepId.get(st.id as string);
    if (!payload) return NextResponse.json({ error: "missing_step", step_id: st.id }, { status: 400 });
    const assigneeId = (payload.assignee_id ?? "").trim();
    const dueAt = (payload.due_at ?? "").trim();
    if (!assigneeId || !dueAt) {
      return NextResponse.json({ error: "missing_fields", step_id: st.id }, { status: 400 });
    }
    const { data: u } = await supabase.from("users").select("id").eq("id", assigneeId).eq("is_active", true).maybeSingle();
    if (!u) return NextResponse.json({ error: "invalid_assignee", step_id: st.id }, { status: 400 });
  }

  const chainType = chain.chain_type as string;

  for (let i = 0; i < list.length; i++) {
    const st = list[i];
    const payload = byStepId.get(st.id as string)!;
    const assigneeId = payload.assignee_id!.trim();
    const dueAt = payload.due_at!.trim();
    const patientRaw = payload.patient_id?.trim() || null;

    const isFirstVertical = chainType === "vertical" && i === 0;
    const isHorizontal = chainType === "horizontal";
    const initialStatus = isHorizontal || isFirstVertical ? ("pending" as const) : ("waiting" as const);

    const res = await insertTaskFromMaster(supabase, {
      actorId: actorId!,
      taskMasterId: st.task_master_id as string,
      assigneeId,
      dueAt,
      patientId: patientRaw,
      psiNodeId: null,
      fromChain: true,
      initialStatus,
    });

    if (res.error) {
      const status = res.error === "insert_failed" ? 500 : 400;
      if (res.error === "insert_failed" && res.supabaseError) {
        console.error("[activate chain] insert_failed", { step_id: st.id, ...res.supabaseError });
        return NextResponse.json(
          {
            error: res.error,
            step_id: st.id,
            supabase_error: res.supabaseError,
            detail: [res.supabaseError.message, res.supabaseError.code && `code=${res.supabaseError.code}`, res.supabaseError.hint, res.supabaseError.details]
              .filter(Boolean)
              .join(" | "),
          },
          { status },
        );
      }
      return NextResponse.json({ error: res.error, step_id: st.id }, { status });
    }

    const taskId = res.task!.id as string;
    await supabase.from("task_chain_steps").update({ task_id: taskId }).eq("id", st.id);

    if (chainType === "vertical") {
      if (i === 0) await supabase.from("task_chain_steps").update({ status: "active" }).eq("id", st.id);
      else await supabase.from("task_chain_steps").update({ status: "waiting" }).eq("id", st.id);
    } else {
      await supabase.from("task_chain_steps").update({ status: "active" }).eq("id", st.id);
    }
  }

  await supabase.from("task_chains").update({ status: "active" }).eq("id", chainId);

  const { data: chainOut } = await supabase.from("task_chains").select("*").eq("id", chainId).single();
  return NextResponse.json({ chain: chainOut });
}
