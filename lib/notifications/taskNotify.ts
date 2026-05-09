import { insertNotification } from "@/lib/notifications/insert";
import type { createServiceClient } from "@/lib/supabase/service";

type Supabase = ReturnType<typeof createServiceClient>;

export async function notifyNewTaskAssigned(supabase: Supabase, assigneeId: string, taskTitle: string, taskId: string) {
  await insertNotification(supabase, {
    user_id: assigneeId,
    type: "task_assigned",
    title: "New task assigned",
    body: taskTitle,
    related_task_id: taskId,
  });
}

/** Notify all active CEOs and the task creator (excluding the blocking assignee). */
export async function notifyTaskBlockedCeoAndCreator(
  supabase: Supabase,
  assigneeId: string,
  createdBy: string | null,
  taskTitle: string,
  taskId: string,
) {
  const { data: ceos } = await supabase.from("users").select("id").eq("role", "ceo").eq("is_active", true);
  const userIds = new Set<string>();
  for (const u of ceos ?? []) {
    if ((u.id as string) !== assigneeId) userIds.add(u.id as string);
  }
  if (createdBy && createdBy !== assigneeId) userIds.add(createdBy);
  const rows = [...userIds].map((user_id) => ({
    user_id,
    type: "task_blocked",
    title: "Task blocked",
    body: taskTitle,
    related_task_id: taskId,
  }));
  if (rows.length) await supabase.from("notifications").insert(rows);
}

export async function notifyTaskCompletedRequester(
  supabase: Supabase,
  createdBy: string | null,
  actorId: string,
  taskTitle: string,
  taskId: string,
) {
  if (!createdBy || createdBy === actorId) return;
  await insertNotification(supabase, {
    user_id: createdBy,
    type: "task_completed",
    title: "Task completed",
    body: taskTitle,
    related_task_id: taskId,
  });
}
