import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: chain, error } = await supabase.from("task_chains").select("*").eq("id", id).maybeSingle();
  if (error || !chain) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: steps } = await supabase
    .from("task_chain_steps")
    .select("id, task_id, task_master_id, default_assignee_role, step_order, status, skip_reason, created_at")
    .eq("chain_id", id)
    .order("step_order", { ascending: true });

  const taskIds = [...new Set((steps ?? []).map((s) => s.task_id).filter(Boolean))] as string[];
  let taskMap: Record<string, { id: string; title: string; status: string }> = {};
  if (taskIds.length) {
    const { data: tasks } = await supabase.from("tasks").select("id, title, status").in("id", taskIds);
    taskMap = Object.fromEntries((tasks ?? []).map((t) => [t.id as string, t as { id: string; title: string; status: string }]));
  }

  const masterIds = [...new Set((steps ?? []).map((s) => s.task_master_id).filter(Boolean))] as string[];
  let masterMap: Record<string, { id: string; title: string; task_type: string }> = {};
  if (masterIds.length) {
    const { data: masters } = await supabase.from("task_master").select("id, title, task_type").in("id", masterIds);
    masterMap = Object.fromEntries(
      (masters ?? []).map((m) => [m.id as string, m as { id: string; title: string; task_type: string }]),
    );
  }

  const stepsOut = (steps ?? []).map((s) => ({
    ...s,
    task: s.task_id ? (taskMap[s.task_id as string] ?? null) : null,
    task_master: s.task_master_id ? (masterMap[s.task_master_id as string] ?? null) : null,
  }));

  const total = stepsOut.filter((s) => s.task_id).length;
  const closed = stepsOut.filter((s) => {
    if (!s.task_id) return false;
    if (s.status === "skipped" || s.status === "completed") return true;
    return s.task?.status === "closed";
  }).length;

  return NextResponse.json({ chain, steps: stepsOut, progress: { closed, total } });
}

type PatchBody = {
  action?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = body.action;
  if (!["approve", "pause", "resume"].includes(action ?? "")) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  if (action === "approve") {
    if (!(await assertCeo(actorId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else if (!(await assertCeoOrOps(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: chain, error: fErr } = await supabase.from("task_chains").select("*").eq("id", id).maybeSingle();
  if (fErr || !chain) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (action === "approve") {
    if (chain.status !== "proposed") return NextResponse.json({ error: "invalid_state" }, { status: 400 });

    const { data: steps } = await supabase
      .from("task_chain_steps")
      .select("id, step_order, task_id, task_master_id")
      .eq("chain_id", id)
      .order("step_order", { ascending: true });

    const list = steps ?? [];
    if (!list.length) return NextResponse.json({ error: "no_steps" }, { status: 400 });

    const allLegacy = list.every((s) => s.task_id);
    const allBlueprint = list.every((s) => !s.task_id && s.task_master_id);

    if (!allLegacy && !allBlueprint) {
      return NextResponse.json({ error: "invalid_steps" }, { status: 400 });
    }

    if (allBlueprint) {
      await supabase.from("task_chains").update({ status: "approved", approved_by: actorId! }).eq("id", id);
      await supabase.from("task_chain_steps").update({ status: "waiting" }).eq("chain_id", id);
      const { data: updated } = await supabase.from("task_chains").select("*").eq("id", id).single();
      return NextResponse.json({ chain: updated });
    }

    if (chain.chain_type === "vertical") {
      const first = list[0];
      await supabase.from("task_chain_steps").update({ status: "waiting" }).eq("chain_id", id);
      if (first?.id) await supabase.from("task_chain_steps").update({ status: "active" }).eq("id", first.id);
      await supabase.from("task_chains").update({ status: "approved", approved_by: actorId! }).eq("id", id);
    } else {
      await supabase.from("task_chain_steps").update({ status: "active" }).eq("chain_id", id);
      await supabase.from("task_chains").update({ status: "active", approved_by: actorId! }).eq("id", id);
    }

    const { data: updated } = await supabase.from("task_chains").select("*").eq("id", id).single();
    return NextResponse.json({ chain: updated });
  }

  if (action === "pause") {
    if (!["active", "approved"].includes(chain.status as string)) {
      return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    }
    await supabase.from("task_chains").update({ status: "paused" }).eq("id", id);
    const { data: updated } = await supabase.from("task_chains").select("*").eq("id", id).single();
    return NextResponse.json({ chain: updated });
  }

  /* resume */
  if (chain.status !== "paused") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  await supabase.from("task_chains").update({ status: "active" }).eq("id", id);
  const { data: updated } = await supabase.from("task_chains").select("*").eq("id", id).single();
  return NextResponse.json({ chain: updated });
}
