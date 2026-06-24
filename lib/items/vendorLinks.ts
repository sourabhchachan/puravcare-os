import type { createServiceClient } from "@/lib/supabase/service";

type Supabase = ReturnType<typeof createServiceClient>;

export type ItemVendorLink = { item_id: string; vendor_id: string };

export async function validateVendorIds(supabase: Supabase, vendorIds: string[]): Promise<boolean> {
  if (!vendorIds.length) return false;
  const unique = [...new Set(vendorIds)];
  const { data, error } = await supabase.from("vendors").select("id").in("id", unique).eq("is_active", true);
  if (error) return false;
  return (data ?? []).length === unique.length;
}

export async function syncItemVendors(supabase: Supabase, itemId: string, vendorIds: string[]) {
  const unique = [...new Set(vendorIds)];
  const { error: delErr } = await supabase.from("item_vendors").delete().eq("item_id", itemId);
  if (delErr) throw new Error("vendor_link_delete_failed");
  if (!unique.length) return;
  const { error: insErr } = await supabase.from("item_vendors").insert(
    unique.map((vendor_id) => ({ item_id: itemId, vendor_id })),
  );
  if (insErr) throw new Error("vendor_link_insert_failed");
}

export async function fetchItemVendorLinks(
  supabase: Supabase,
  itemIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!itemIds.length) return map;
  const { data, error } = await supabase.from("item_vendors").select("item_id, vendor_id").in("item_id", itemIds);
  if (error) throw new Error("vendor_link_fetch_failed");
  for (const row of data ?? []) {
    const itemId = row.item_id as string;
    const vendorId = row.vendor_id as string;
    const list = map.get(itemId) ?? [];
    list.push(vendorId);
    map.set(itemId, list);
  }
  return map;
}

export async function fetchItemIdsForVendors(supabase: Supabase, vendorIds: string[]): Promise<string[]> {
  if (!vendorIds.length) return [];
  const { data, error } = await supabase.from("item_vendors").select("item_id").in("vendor_id", vendorIds);
  if (error) throw new Error("vendor_link_fetch_failed");
  return [...new Set((data ?? []).map((r) => r.item_id as string))];
}

export function enrichItemRow<T extends { id: string; vendor_id?: string | null }>(
  row: T,
  vendorIdsByItem: Map<string, string[]>,
  vendorNameMap: Record<string, string>,
) {
  const vendor_ids = vendorIdsByItem.get(row.id as string) ?? (row.vendor_id ? [row.vendor_id as string] : []);
  const vendor_names = vendor_ids.map((id) => vendorNameMap[id] ?? "—");
  return {
    ...row,
    vendor_ids,
    vendor_names,
    vendor_name: vendor_names[0] ?? null,
    vendor_id: vendor_ids[0] ?? row.vendor_id ?? null,
  };
}
