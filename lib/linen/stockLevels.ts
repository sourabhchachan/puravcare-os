import type { createServiceClient } from "@/lib/supabase/service";

import { LINEN_STATUSES, type LinenStatus } from "@/lib/linen/constants";

type Supabase = ReturnType<typeof createServiceClient>;

export type LinenStockRow = {
  item_id: string;
  item_name: string;
  in_store: number;
  in_use: number;
  in_laundry_bag: number;
  in_laundry: number;
  lost: number;
  damaged: number;
};

function emptyBuckets(): Record<LinenStatus, number> {
  return {
    in_store: 0,
    in_use: 0,
    in_laundry_bag: 0,
    in_laundry: 0,
    lost: 0,
    damaged: 0,
  };
}

export async function fetchLinenStockLevels(
  supabase: Supabase,
  options?: { vendorId?: string },
): Promise<LinenStockRow[]> {
  let itemsQuery = supabase
    .from("items")
    .select("id, name, vendor_id, vendors(category)")
    .eq("track_inventory", true)
    .eq("is_active", true);

  if (options?.vendorId) {
    itemsQuery = itemsQuery.eq("vendor_id", options.vendorId);
  }

  const { data: items, error: itemsErr } = await itemsQuery.order("name");
  if (itemsErr) throw new Error("fetch_failed");

  const linenItems = (items ?? []).filter((item) => {
    const rel = item.vendors as { category: string | null } | { category: string | null }[] | null;
    const vendor = Array.isArray(rel) ? rel[0] : rel;
    return (vendor?.category ?? "").toLowerCase() === "linen_store";
  });

  if (!linenItems.length) return [];

  const itemIds = linenItems.map((i) => i.id as string);
  const { data: txns, error: txnErr } = await supabase
    .from("linen_transactions")
    .select("item_id, quantity, from_status, to_status")
    .in("item_id", itemIds);

  if (txnErr) throw new Error("fetch_failed");

  const buckets = new Map<string, Record<LinenStatus, number>>();
  for (const item of linenItems) {
    buckets.set(item.id as string, emptyBuckets());
  }

  for (const txn of txns ?? []) {
    const itemId = txn.item_id as string;
    const bucket = buckets.get(itemId);
    if (!bucket) continue;
    const qty = Number(txn.quantity);
    const from = txn.from_status as LinenStatus | null;
    const to = txn.to_status as LinenStatus;
    if (from && LINEN_STATUSES.includes(from)) bucket[from] -= qty;
    if (LINEN_STATUSES.includes(to)) bucket[to] += qty;
  }

  return linenItems.map((item) => {
    const id = item.id as string;
    const b = buckets.get(id) ?? emptyBuckets();
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      item_id: id,
      item_name: item.name as string,
      in_store: round(b.in_store),
      in_use: round(b.in_use),
      in_laundry_bag: round(b.in_laundry_bag),
      in_laundry: round(b.in_laundry),
      lost: round(b.lost),
      damaged: round(b.damaged),
    };
  });
}

export async function getLinenStatusQty(
  supabase: Supabase,
  itemId: string,
  status: LinenStatus,
): Promise<number> {
  const { data: txns, error } = await supabase
    .from("linen_transactions")
    .select("quantity, from_status, to_status")
    .eq("item_id", itemId);
  if (error) throw new Error("fetch_failed");
  const bucket = emptyBuckets();
  for (const txn of txns ?? []) {
    const qty = Number(txn.quantity);
    const from = txn.from_status as LinenStatus | null;
    const to = txn.to_status as LinenStatus;
    if (from && LINEN_STATUSES.includes(from)) bucket[from] -= qty;
    if (LINEN_STATUSES.includes(to)) bucket[to] += qty;
  }
  return Math.round(bucket[status] * 100) / 100;
}
