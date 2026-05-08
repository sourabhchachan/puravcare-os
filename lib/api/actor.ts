import { createServiceClient } from "@/lib/supabase/service";

export function getActorId(request: Request): string | null {
  return request.headers.get("x-actor-id")?.trim() || null;
}

export async function getUserRole(actorId: string | null): Promise<string | null> {
  if (!actorId) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("users").select("role").eq("id", actorId).maybeSingle();
  if (error || !data) return null;
  return data.role as string;
}

export async function canCreateTasks(actorId: string | null): Promise<boolean> {
  if (!actorId) return false;
  const role = await getUserRole(actorId);
  if (role === "ceo") return true;
  const supabase = createServiceClient();
  const { data } = await supabase.from("permissions").select("can_create_tasks").eq("user_id", actorId).maybeSingle();
  return Boolean(data?.can_create_tasks);
}

export async function canCreateItems(actorId: string | null): Promise<boolean> {
  if (!actorId) return false;
  const role = await getUserRole(actorId);
  if (role === "ceo") return true;
  const supabase = createServiceClient();
  const { data } = await supabase.from("permissions").select("can_create_items").eq("user_id", actorId).maybeSingle();
  return Boolean(data?.can_create_items);
}

export async function assertActiveUser(actorId: string | null): Promise<boolean> {
  if (!actorId) return false;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("users").select("id").eq("id", actorId).eq("is_active", true).maybeSingle();
  return !error && Boolean(data);
}
