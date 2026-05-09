import type { createServiceClient } from "@/lib/supabase/service";

type Supabase = ReturnType<typeof createServiceClient>;

export async function advanceVerticalChainFromStepOrder(supabase: Supabase, chainId: string, completedStepOrder: number) {
  const { data: next } = await supabase
    .from("task_chain_steps")
    .select("id, task_id")
    .eq("chain_id", chainId)
    .gt("step_order", completedStepOrder)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (next?.id && next.task_id) {
    await supabase.from("task_chain_steps").update({ status: "active" }).eq("id", next.id);
    await supabase.from("task_chains").update({ status: "active" }).eq("id", chainId);
    return;
  }

  await supabase.from("task_chains").update({ status: "completed" }).eq("id", chainId);
}

/** Any task that belongs to a paused chain cannot progress until the chain resumes. */
export async function isChainPausedBlockingTask(supabase: Supabase, taskId: string): Promise<boolean> {
  const { data: step } = await supabase.from("task_chain_steps").select("chain_id").eq("task_id", taskId).maybeSingle();
  if (!step) return false;
  const { data: chain } = await supabase.from("task_chains").select("status").eq("id", step.chain_id).maybeSingle();
  return chain?.status === "paused";
}

/** True if this task is in a vertical chain step that is not yet active (cannot start work). */
export async function isVerticalChainTaskLocked(supabase: Supabase, taskId: string): Promise<boolean> {
  const { data: step } = await supabase.from("task_chain_steps").select("id, status, chain_id").eq("task_id", taskId).maybeSingle();
  if (!step) return false;
  const { data: chain } = await supabase.from("task_chains").select("chain_type, status").eq("id", step.chain_id).maybeSingle();
  if (!chain || chain.chain_type !== "vertical") return false;
  if (!["active", "approved"].includes(chain.status as string)) return false;
  return step.status !== "active";
}

/** Combined guard for assignee actions (vertical ordering + paused chain). */
export async function isChainTaskProgressBlocked(supabase: Supabase, taskId: string): Promise<boolean> {
  if (await isChainPausedBlockingTask(supabase, taskId)) return true;
  if (await isVerticalChainTaskLocked(supabase, taskId)) return true;
  return false;
}

/** First acknowledge on an approved vertical chain turns the chain status to `active` (blue). */
export async function maybeActivateVerticalChainOnAcknowledge(supabase: Supabase, taskId: string): Promise<void> {
  const { data: step } = await supabase.from("task_chain_steps").select("id, status, chain_id").eq("task_id", taskId).maybeSingle();
  if (!step || step.status !== "active") return;
  const { data: chain } = await supabase.from("task_chains").select("chain_type, status").eq("id", step.chain_id).maybeSingle();
  if (!chain || chain.chain_type !== "vertical" || chain.status !== "approved") return;
  await supabase.from("task_chains").update({ status: "active" }).eq("id", step.chain_id as string);
}

export async function pauseChainsForBlockedTask(
  supabase: Supabase,
  taskId: string,
  taskTitle: string,
): Promise<void> {
  const { data: steps } = await supabase.from("task_chain_steps").select("chain_id").eq("task_id", taskId);
  const chainIds = [...new Set((steps ?? []).map((s) => s.chain_id as string))];

  for (const chainId of chainIds) {
    const { data: ch } = await supabase.from("task_chains").select("id, title, status").eq("id", chainId).maybeSingle();
    if (!ch || ch.status !== "active") continue;

    await supabase.from("task_chains").update({ status: "paused" }).eq("id", chainId);

    const { data: notifyUsers } = await supabase.from("users").select("id").in("role", ["ceo", "ops"]).eq("is_active", true);

    const title = `Chain paused: ${ch.title as string}`;
    const body = `Task “${taskTitle}” was blocked.`;
    const rows = (notifyUsers ?? []).map((u) => ({
      user_id: u.id as string,
      type: "chain_paused",
      title,
      body,
      related_task_id: taskId,
    }));
    if (rows.length) await supabase.from("notifications").insert(rows);
  }
}

/** Vertical: after a task reaches `closed`, advance chain or complete it. Idempotent. */
export async function processVerticalChainAfterTaskClosed(supabase: Supabase, closedTaskId: string): Promise<void> {
  const { data: step } = await supabase
    .from("task_chain_steps")
    .select("id, chain_id, step_order, status")
    .eq("task_id", closedTaskId)
    .maybeSingle();
  if (!step) return;

  const { data: chain } = await supabase.from("task_chains").select("chain_type, status").eq("id", step.chain_id).maybeSingle();
  if (!chain || chain.chain_type !== "vertical") return;
  if (!["active", "approved"].includes(chain.status as string)) return;

  if (step.status === "completed" || step.status === "skipped") return;

  await supabase.from("task_chain_steps").update({ status: "completed" }).eq("id", step.id);
  await advanceVerticalChainFromStepOrder(supabase, step.chain_id as string, step.step_order as number);
}

/** Horizontal: after a task reaches `closed`, update progress and maybe complete chain. Idempotent. */
export async function processHorizontalChainAfterTaskClosed(supabase: Supabase, closedTaskId: string): Promise<void> {
  const { data: step } = await supabase.from("task_chain_steps").select("id, chain_id, status").eq("task_id", closedTaskId).maybeSingle();
  if (!step) return;

  const { data: chain } = await supabase.from("task_chains").select("chain_type, status").eq("id", step.chain_id).maybeSingle();
  if (!chain || chain.chain_type !== "horizontal") return;
  if (!["active", "approved"].includes(chain.status as string)) return;

  if (step.status === "completed" || step.status === "skipped") return;

  await supabase.from("task_chain_steps").update({ status: "completed" }).eq("id", step.id);

  const { data: steps } = await supabase.from("task_chain_steps").select("id, task_id, status").eq("chain_id", step.chain_id);
  const list = (steps ?? []).filter((x) => x.task_id);
  let done = 0;
  for (const st of list) {
    if (st.status === "skipped" || st.status === "completed") {
      done += 1;
      continue;
    }
    const { data: t } = await supabase.from("tasks").select("status").eq("id", st.task_id as string).maybeSingle();
    if (t?.status === "closed") done += 1;
  }

  if (done >= list.length && list.length > 0) {
    await supabase.from("task_chains").update({ status: "completed" }).eq("id", step.chain_id);
  } else {
    await supabase.from("task_chains").update({ status: "active" }).eq("id", step.chain_id);
  }
}

export async function processAllChainsAfterTaskClosed(supabase: Supabase, closedTaskId: string) {
  await processVerticalChainAfterTaskClosed(supabase, closedTaskId);
  await processHorizontalChainAfterTaskClosed(supabase, closedTaskId);
}
