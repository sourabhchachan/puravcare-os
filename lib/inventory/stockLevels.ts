import type { createServiceClient } from "@/lib/supabase/service";

import { fetchItemIdsForVendors } from "@/lib/items/vendorLinks";

type Supabase = ReturnType<typeof createServiceClient>;

export type StockLevelRow = {
  item_id: string;
  item_name: string;
  current_stock: number;
  min_stock_threshold: number | null;
  is_low_stock: boolean;
};

function sumByItemId(rows: { item_id: string; quantity: number | string }[] | null) {
  const map = new Map<string, number>();
  for (const r of rows ?? []) {
    const id = r.item_id as string;
    map.set(id, (map.get(id) ?? 0) + Number(r.quantity));
  }
  return map;
}

function sumQuantities(rows: { quantity: number | string }[] | null) {
  return (rows ?? []).reduce((sum, r) => sum + Number(r.quantity), 0);
}

export function computeCurrentStock(stockIn: number, stockOut: number, adjustments: number) {
  return Math.round((stockIn - stockOut + adjustments) * 100) / 100;
}

export async function getItemCurrentStock(supabase: Supabase, itemId: string): Promise<number> {
  const [{ data: stockRows, error: stockErr }, { data: outRows, error: outErr }, { data: adjRows, error: adjErr }] =
    await Promise.all([
      supabase.from("inventory_stock").select("quantity").eq("item_id", itemId),
      supabase
        .from("inventory_transactions")
        .select("quantity")
        .eq("item_id", itemId)
        .eq("transaction_type", "stock_out"),
      supabase
        .from("inventory_transactions")
        .select("quantity")
        .eq("item_id", itemId)
        .eq("transaction_type", "adjustment"),
    ]);

  if (stockErr || outErr || adjErr) throw new Error("fetch_failed");

  return computeCurrentStock(
    sumQuantities(stockRows as { quantity: number }[]),
    sumQuantities(outRows as { quantity: number }[]),
    sumQuantities(adjRows as { quantity: number }[]),
  );
}

export async function fetchStockLevels(
  supabase: Supabase,
  options?: { vendorId?: string; vendorIds?: string[] },
): Promise<StockLevelRow[]> {
  let itemsQuery = supabase
    .from("items")
    .select("id, name, min_stock_threshold, vendor_id")
    .eq("track_inventory", true)
    .eq("is_active", true);

  if (options?.vendorIds?.length) {
    const itemIds = await fetchItemIdsForVendors(supabase, options.vendorIds);
    if (!itemIds.length) return [];
    itemsQuery = itemsQuery.in("id", itemIds);
  } else if (options?.vendorId) {
    const itemIds = await fetchItemIdsForVendors(supabase, [options.vendorId]);
    if (!itemIds.length) return [];
    itemsQuery = itemsQuery.in("id", itemIds);
  }

  const { data: items, error: itemsErr } = await itemsQuery.order("name");
  if (itemsErr) throw new Error("fetch_failed");

  const list = items ?? [];
  if (!list.length) return [];

  const itemIds = list.map((i) => i.id as string);

  const [
    { data: stockRows, error: stockErr },
    { data: outRows, error: outErr },
    { data: adjRows, error: adjErr },
  ] = await Promise.all([
    supabase.from("inventory_stock").select("item_id, quantity").in("item_id", itemIds),
    supabase
      .from("inventory_transactions")
      .select("item_id, quantity")
      .in("item_id", itemIds)
      .eq("transaction_type", "stock_out"),
    supabase
      .from("inventory_transactions")
      .select("item_id, quantity")
      .in("item_id", itemIds)
      .eq("transaction_type", "adjustment"),
  ]);

  if (stockErr || outErr || adjErr) throw new Error("fetch_failed");

  const stockIn = sumByItemId(stockRows as { item_id: string; quantity: number }[]);
  const stockOut = sumByItemId(outRows as { item_id: string; quantity: number }[]);
  const adjustments = sumByItemId(adjRows as { item_id: string; quantity: number }[]);

  return list.map((item) => {
    const id = item.id as string;
    const current = computeCurrentStock(
      stockIn.get(id) ?? 0,
      stockOut.get(id) ?? 0,
      adjustments.get(id) ?? 0,
    );
    const threshold = item.min_stock_threshold as number | null;
    const isLow = threshold != null && current < threshold;
    return {
      item_id: id,
      item_name: item.name as string,
      current_stock: current,
      min_stock_threshold: threshold,
      is_low_stock: isLow,
    };
  });
}

export function expiryWindowIso() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(today), to: fmt(end) };
}
