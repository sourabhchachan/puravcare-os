import { insertTaskNotificationDeduped } from "@/lib/notifications/insert";
import type { createServiceClient } from "@/lib/supabase/service";

type Supabase = ReturnType<typeof createServiceClient>;

const OPEN = ["pending", "acknowledged", "in_progress", "done", "blocked"];

/**
 * Creates overdue notifications for critical (15m past due) and high (60m past due) tasks.
 * Deduped per assignee per task per type within 24h.
 */
export async function scanOverdueTaskNotifications(supabase: Supabase): Promise<void> {
  const now = Date.now();
  const m15 = new Date(now - 15 * 60 * 1000).toISOString();
  const m60 = new Date(now - 60 * 60 * 1000).toISOString();

  const { data: criticalRows } = await supabase
    .from("tasks")
    .select("id, title, assignee_id, due_at, priority, status")
    .eq("is_active", true)
    .eq("priority", "critical")
    .in("status", OPEN)
    .not("due_at", "is", null)
    .lt("due_at", m15);

  for (const t of criticalRows ?? []) {
    const tid = t.id as string;
    const aid = t.assignee_id as string;
    const title = (t.title as string) ?? "Task";
    if (!aid) continue;
    await insertTaskNotificationDeduped(
      supabase,
      aid,
      "task_overdue_critical",
      "Critical task overdue",
      title,
      tid,
      24 * 60 * 60 * 1000,
    );
  }

  const { data: highRows } = await supabase
    .from("tasks")
    .select("id, title, assignee_id, due_at, priority, status")
    .eq("is_active", true)
    .eq("priority", "high")
    .in("status", OPEN)
    .not("due_at", "is", null)
    .lt("due_at", m60);

  for (const t of highRows ?? []) {
    const tid = t.id as string;
    const aid = t.assignee_id as string;
    const title = (t.title as string) ?? "Task";
    if (!aid) continue;
    await insertTaskNotificationDeduped(
      supabase,
      aid,
      "task_overdue_high",
      "Task overdue",
      title,
      tid,
      24 * 60 * 60 * 1000,
    );
  }
}
