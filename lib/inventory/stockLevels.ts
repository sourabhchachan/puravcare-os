import type { createServiceClient } from "@/lib/supabase/service";

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

export async function fetchStockLevels(
  supabase: Supabase,
  options?: { vendorId?: string },
): Promise<StockLevelRow[]> {
  let itemsQuery = supabase
    .from("items")
    .select("id, name, min_stock_threshold, vendor_id")
    .eq("track_inventory", true)
    .eq("is_active", true);

  if (options?.vendorId) {
    itemsQuery = itemsQuery.eq("vendor_id", options.vendorId);
  }

  const { data: items, error: itemsErr } = await itemsQuery.order("name");
  if (itemsErr) throw new Error("fetch_failed");

  const list = items ?? [];
  if (!list.length) return [];

  const itemIds = list.map((i) => i.id as string);

  const [{ data: stockRows, error: stockErr }, { data: outRows, error: outErr }] = await Promise.all([
    supabase.from("inventory_stock").select("item_id, quantity").in("item_id", itemIds),
    supabase
      .from("inventory_transactions")
      .select("item_id, quantity")
      .in("item_id", itemIds)
      .eq("transaction_type", "stock_out"),
  ]);

  if (stockErr || outErr) throw new Error("fetch_failed");

  const stockIn = sumByItemId(stockRows as { item_id: string; quantity: number }[]);
  const stockOut = sumByItemId(outRows as { item_id: string; quantity: number }[]);

  return list.map((item) => {
    const id = item.id as string;
    const current = (stockIn.get(id) ?? 0) - (stockOut.get(id) ?? 0);
    const threshold = item.min_stock_threshold as number | null;
    const isLow = threshold != null && current < threshold;
    return {
      item_id: id,
      item_name: item.name as string,
      current_stock: Math.round(current * 100) / 100,
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
