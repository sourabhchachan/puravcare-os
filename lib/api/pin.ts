import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

export const SYSTEM_ADMIN_LOGIN_ID = "1234567890";

export async function canResetPin(actorId: string | null | undefined): Promise<boolean> {
  if (!actorId) return false;
  if (await assertCeo(actorId)) return true;
  const supabase = createServiceClient();
  const { data } = await supabase.from("users").select("login_id").eq("id", actorId).maybeSingle();
  return data?.login_id === SYSTEM_ADMIN_LOGIN_ID;
}

export function isDefaultPin(passwordHash: string | null | undefined): boolean {
  return passwordHash === "000000";
}

export function mustChangePin(passwordHash: string | null | undefined, mustChangeFlag: boolean | null | undefined): boolean {
  return Boolean(mustChangeFlag) || isDefaultPin(passwordHash);
}
