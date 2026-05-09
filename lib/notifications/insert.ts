import type { createServiceClient } from "@/lib/supabase/service";

type Supabase = ReturnType<typeof createServiceClient>;

export async function insertNotification(
  supabase: Supabase,
  row: {
    user_id: string;
    type: string;
    title: string;
    body: string | null;
    related_task_id?: string | null;
  },
) {
  await supabase.from("notifications").insert({
    user_id: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    related_task_id: row.related_task_id ?? null,
  });
}

/** Dedupe: skip if same type+task already notified in the last `windowMs` ms. */
export async function insertTaskNotificationDeduped(
  supabase: Supabase,
  userId: string,
  type: string,
  title: string,
  body: string | null,
  relatedTaskId: string,
  windowMs: number,
): Promise<void> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type)
    .eq("related_task_id", relatedTaskId)
    .gte("created_at", since)
    .maybeSingle();
  if (existing) return;
  await insertNotification(supabase, { user_id: userId, type, title, body, related_task_id: relatedTaskId });
}
