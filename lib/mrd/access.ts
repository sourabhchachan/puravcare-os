import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

export async function isMrdMember(actorId: string | null | undefined): Promise<boolean> {
  if (!actorId) return false;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrd_members")
    .select("id")
    .eq("user_id", actorId)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function canManageMrd(actorId: string | null | undefined): Promise<boolean> {
  if (!actorId) return false;
  if (await assertCeo(actorId)) return true;
  return isMrdMember(actorId);
}

export async function canViewMrdFiles(actorId: string | null | undefined): Promise<boolean> {
  return canManageMrd(actorId);
}

export async function canViewAllMrdRequests(actorId: string | null | undefined): Promise<boolean> {
  return canManageMrd(actorId);
}
