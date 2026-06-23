import { getUserRole } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

export async function getVendorIdsForUser(actorId: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data: links } = await supabase.from("vendor_users").select("vendor_id").eq("user_id", actorId);
  return [...new Set((links ?? []).map((l) => l.vendor_id as string).filter(Boolean))];
}

/** All vendor rows linked to this user (for role vendor). */
export async function getVendorsForUser(actorId: string) {
  const ids = await getVendorIdsForUser(actorId);
  if (!ids.length) return [];
  const supabase = createServiceClient();
  const { data: vendors } = await supabase.from("vendors").select("*").in("id", ids);
  return vendors ?? [];
}

/** Vendor row linked to this user (for role vendor). Returns first link for backward compatibility. */
export async function getVendorForUser(actorId: string) {
  const vendors = await getVendorsForUser(actorId);
  return vendors[0] ?? null;
}

export async function canViewVendor(actorId: string, vendorId: string): Promise<boolean> {
  const role = await getUserRole(actorId);
  if (role === "ceo" || role === "ops") return true;
  if (role === "vendor") {
    const ids = await getVendorIdsForUser(actorId);
    return ids.includes(vendorId);
  }
  return false;
}
