import { createServiceClient } from "@/lib/supabase/service";

export async function assertCeo(actorId: string | null | undefined) {
  if (!actorId) return false;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("users").select("role").eq("id", actorId).maybeSingle();
  if (error || !data) return false;
  return data.role === "ceo";
}
