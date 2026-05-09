import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: chains, error } = await supabase.from("task_chains").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const ids = (chains ?? []).map((c) => c.id as string);
  let stepCountMap: Record<string, number> = {};
  if (ids.length) {
    const { data: steps } = await supabase.from("task_chain_steps").select("chain_id").in("chain_id", ids);
    for (const s of steps ?? []) {
      const cid = s.chain_id as string;
      stepCountMap[cid] = (stepCountMap[cid] ?? 0) + 1;
    }
  }

  const rows = (chains ?? []).map((c) => ({
    ...c,
    step_count: stepCountMap[c.id as string] ?? 0,
  }));

  return NextResponse.json({ chains: rows });
}

type PostBody = {
  title?: string;
  chain_type?: string;
  task_ids?: string[];
};

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const chainType = (body.chain_type ?? "").toLowerCase();
  const taskIds = Array.isArray(body.task_ids) ? body.task_ids.map((x) => String(x).trim()).filter(Boolean) : [];

  if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });
  if (!["vertical", "horizontal"].includes(chainType)) return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  if (taskIds.length === 0) return NextResponse.json({ error: "missing_tasks" }, { status: 400 });
  if (new Set(taskIds).size !== taskIds.length) return NextResponse.json({ error: "duplicate_tasks" }, { status: 400 });

  const supabase = createServiceClient();
  for (const tid of taskIds) {
    const { data: t } = await supabase.from("tasks").select("id").eq("id", tid).eq("is_active", true).maybeSingle();
    if (!t) return NextResponse.json({ error: "invalid_task", task_id: tid }, { status: 400 });
  }

  const { data: chain, error: cErr } = await supabase
    .from("task_chains")
    .insert({
      title,
      chain_type: chainType,
      status: "proposed",
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (cErr || !chain) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  const stepRows = taskIds.map((task_id, i) => ({
    chain_id: chain.id as string,
    task_id,
    step_order: i + 1,
    status: "waiting" as const,
  }));

  const { error: sErr } = await supabase.from("task_chain_steps").insert(stepRows);
  if (sErr) {
    await supabase.from("task_chains").delete().eq("id", chain.id);
    return NextResponse.json({ error: "steps_failed" }, { status: 500 });
  }

  return NextResponse.json({ chain });
}
