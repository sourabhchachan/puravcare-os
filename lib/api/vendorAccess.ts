import { getUserRole } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

/** Vendor row linked to this user (for role vendor). */
export async function getVendorForUser(actorId: string) {
  const supabase = createServiceClient();
  const { data: link } = await supabase.from("vendor_users").select("vendor_id").eq("user_id", actorId).limit(1).maybeSingle();
  if (!link) return null;
  const { data: vendor } = await supabase.from("vendors").select("*").eq("id", link.vendor_id as string).maybeSingle();
  return vendor;
}

export async function canViewVendor(actorId: string, vendorId: string): Promise<boolean> {
  const role = await getUserRole(actorId);
  if (role === "ceo" || role === "ops") return true;
  if (role === "vendor") {
    const v = await getVendorForUser(actorId);
    return Boolean(v && (v as { id: string }).id === vendorId);
  }
  return false;
}
