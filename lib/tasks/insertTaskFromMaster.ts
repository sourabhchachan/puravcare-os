import { notifyNewTaskAssigned } from "@/lib/notifications/taskNotify";
import type { createServiceClient } from "@/lib/supabase/service";
import { taskTypeForInsertFromTemplate } from "@/lib/task/taskTypes";

type Supabase = ReturnType<typeof createServiceClient>;

const RECURRENCE = ["one-time", "hourly", "2h", "4h", "6h", "8h", "daily", "weekly", "monthly", "yearly"] as const;

/** Extra context when `tasks.insert` fails (RLS, CHECK constraint, FK, etc.). */
export type SupabaseInsertErrorInfo = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export type InsertTaskFromMasterResult =
  | { task: Record<string, unknown>; error?: undefined; supabaseError?: undefined }
  | { error: string; task?: undefined; supabaseError?: SupabaseInsertErrorInfo };

export type InsertTaskFromMasterParams = {
  actorId: string;
  taskMasterId: string;
  assigneeId: string;
  dueAt: string | null;
  patientId: string | null;
  psiNodeId: string | null;
  /** Chain-activated tasks only; never from public task-create API. */
  fromChain: boolean;
  initialStatus: "pending" | "waiting";
  priority?: string;
  proofType?: string;
  recurrence?: string;
  countersignUserId?: string | null;
};

export async function insertTaskFromMaster(supabase: Supabase, p: InsertTaskFromMasterParams): Promise<InsertTaskFromMasterResult> {
  const priority = p.priority ?? "normal";
  if (!["critical", "high", "normal", "low"].includes(priority)) {
    return { error: "invalid_priority" };
  }

  const proofType = p.proofType ?? "tap";
  if (!["tap", "photo", "countersign"].includes(proofType)) {
    return { error: "invalid_proof" };
  }

  const recurrence = p.recurrence ?? "one-time";
  if (!RECURRENCE.includes(recurrence as (typeof RECURRENCE)[number])) {
    return { error: "invalid_recurrence" };
  }

  if (proofType === "countersign" && !p.countersignUserId) {
    return { error: "missing_countersigner" };
  }

  const { data: master, error: mErr } = await supabase
    .from("task_master")
    .select("id, title, task_type, is_active, psi_node_id")
    .eq("id", p.taskMasterId)
    .maybeSingle();

  if (mErr || !master || !master.is_active) {
    return { error: "invalid_task_master" };
  }

  const taskType = taskTypeForInsertFromTemplate(master.task_type as string);
  if (taskType === "clinical" && !p.patientId) {
    return { error: "missing_patient" };
  }

  const { data: assignee } = await supabase
    .from("users")
    .select("id")
    .eq("id", p.assigneeId)
    .eq("is_active", true)
    .maybeSingle();
  if (!assignee) return { error: "invalid_assignee" };

  const resolvedPsi = p.psiNodeId ?? (master.psi_node_id as string | null) ?? null;
  if (resolvedPsi) {
    const { data: psi } = await supabase
      .from("psi_nodes")
      .select("id")
      .eq("id", resolvedPsi)
      .eq("status", "approved")
      .eq("type", "problem")
      .eq("is_active", true)
      .maybeSingle();
    if (!psi) return { error: "invalid_psi" };
  }

  if (p.patientId) {
    const { data: pat } = await supabase.from("patients").select("id").eq("id", p.patientId).maybeSingle();
    if (!pat) return { error: "invalid_patient" };
  }

  const title = (master.title as string).trim();
  const insertRow = {
    title,
    task_type: taskType,
    assignee_id: p.assigneeId,
    created_by: p.actorId,
    patient_id: taskType === "clinical" ? p.patientId : null,
    psi_node_id: resolvedPsi,
    task_master_id: p.taskMasterId,
    due_at: p.dueAt || null,
    priority,
    proof_type: proofType,
    countersign_user_id: proofType === "countersign" ? p.countersignUserId : null,
    recurrence,
    status: p.initialStatus,
    is_active: true,
    from_chain: p.fromChain,
  };

  const { data: task, error } = await supabase.from("tasks").insert(insertRow).select("*").single();
  if (error || !task) {
    const supabaseError: SupabaseInsertErrorInfo = error
      ? {
          message: error.message,
          code: error.code,
          details: error.details ?? undefined,
          hint: error.hint ?? undefined,
        }
      : { message: "Insert succeeded but no row was returned" };
    console.error("[insertTaskFromMaster] tasks.insert failed", {
      task_master_id: p.taskMasterId,
      from_chain: p.fromChain,
      ...supabaseError,
    });
    return { error: "insert_failed", supabaseError };
  }

  await supabase.from("task_events").insert({
    task_id: task.id as string,
    actor_id: p.actorId,
    event_type: "created",
    old_value: null,
    new_value: p.initialStatus,
    note: p.fromChain ? "chain_activation" : null,
  });

  if (p.assigneeId !== p.actorId && p.initialStatus === "pending") {
    await notifyNewTaskAssigned(supabase, p.assigneeId, title, task.id as string);
  }

  return { task };
}
