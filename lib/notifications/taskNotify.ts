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

export async function notifyTaskBlockedRequester(
  supabase: Supabase,
  createdBy: string | null,
  actorId: string,
  taskTitle: string,
  taskId: string,
) {
  if (!createdBy || createdBy === actorId) return;
  await insertNotification(supabase, {
    user_id: createdBy,
    type: "task_blocked",
    title: "Task blocked",
    body: taskTitle,
    related_task_id: taskId,
  });
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
