import { insertNotification } from "@/lib/notifications/insert";
import type { createServiceClient } from "@/lib/supabase/service";

type Supabase = ReturnType<typeof createServiceClient>;

export async function notifyMrdMembers(supabase: Supabase, title: string, body: string | null) {
  const { data: members } = await supabase.from("mrd_members").select("user_id");
  for (const m of members ?? []) {
    await insertNotification(supabase, {
      user_id: m.user_id as string,
      type: "mrd",
      title,
      body,
    });
  }
}
