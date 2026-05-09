import { createServiceClient } from "@/lib/supabase/service";

export async function assertCeoOrOps(actorId: string | null | undefined): Promise<boolean> {
  if (!actorId) return false;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("users").select("role").eq("id", actorId).maybeSingle();
  if (error || !data) return false;
  const r = data.role as string;
  return r === "ceo" || r === "ops";
}
