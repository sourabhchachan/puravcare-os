import { getUserRole } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { getVendorForUser } from "@/lib/api/vendorAccess";
import { LINEN_STORE_CATEGORY } from "@/lib/linen/constants";

type VendorRow = { id: string; category?: string | null };

export function isLinenStoreVendor(vendor: VendorRow | null | undefined) {
  return (vendor?.category ?? "").toLowerCase() === LINEN_STORE_CATEGORY;
}

export async function getLinenStoreVendorForUser(actorId: string) {
  const vendor = await getVendorForUser(actorId);
  if (!vendor || !isLinenStoreVendor(vendor as VendorRow)) return null;
  return vendor as VendorRow;
}

export async function canViewLinen(actorId: string) {
  if (await assertCeoOrOps(actorId)) return true;
  const vendor = await getLinenStoreVendorForUser(actorId);
  return Boolean(vendor);
}

export async function assertLinenStoreVendor(actorId: string) {
  const vendor = await getLinenStoreVendorForUser(actorId);
  return vendor;
}

export async function canResolveLinenFollowup(actorId: string) {
  if (await assertCeo(actorId)) return true;
  const vendor = await getLinenStoreVendorForUser(actorId);
  return Boolean(vendor);
}

export async function isLinenItem(
  supabase: ReturnType<typeof import("@/lib/supabase/service").createServiceClient>,
  itemId: string,
) {
  const { data: item } = await supabase
    .from("items")
    .select("id, track_inventory, vendor_id, vendors(category)")
    .eq("id", itemId)
    .maybeSingle();
  if (!item?.track_inventory || !item.vendor_id) return null;
  const rel = item.vendors as { category: string | null } | { category: string | null }[] | null;
  const vendor = Array.isArray(rel) ? rel[0] : rel;
  if (!isLinenStoreVendor({ id: item.vendor_id as string, category: vendor?.category })) return null;
  return { id: item.id as string, vendor_id: item.vendor_id as string };
}
