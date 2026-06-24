import { NextResponse } from "next/server";

import { assertActiveUser, canCreateItems, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import {
  enrichItemRow,
  fetchItemVendorLinks,
  syncItemVendors,
  validateVendorIds,
} from "@/lib/items/vendorLinks";
import { createServiceClient } from "@/lib/supabase/service";

async function assertItemMasterAccess(actorId: string | null) {
  if (!actorId) return false;
  if (await assertCeo(actorId)) return true;
  return canCreateItems(actorId);
}

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertItemMasterAccess(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const [{ data: items, error: itemsError }, { data: vendors }] = await Promise.all([
    supabase
      .from("items")
      .select("id, name, price, vendor_id, is_patient_linked, is_active, track_inventory, min_stock_threshold, created_at")
      .order("name"),
    supabase.from("vendors").select("id, name").eq("is_active", true).order("name"),
  ]);

  if (itemsError) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const vendorMap = Object.fromEntries((vendors ?? []).map((v) => [v.id, v.name]));
  const itemIds = (items ?? []).map((i) => i.id as string);
  const vendorIdsByItem = await fetchItemVendorLinks(supabase, itemIds);
  const rows = (items ?? []).map((row) => enrichItemRow(row, vendorIdsByItem, vendorMap));

  return NextResponse.json({ items: rows, vendors: vendors ?? [] });
}

type PostBody = {
  name?: string;
  price?: number;
  vendor_id?: string | null;
  vendor_ids?: string[];
  is_patient_linked?: boolean;
  is_active?: boolean;
  track_inventory?: boolean;
  min_stock_threshold?: number | null;
};

function parseVendorIds(body: PostBody): string[] {
  if (Array.isArray(body.vendor_ids) && body.vendor_ids.length) {
    return [...new Set(body.vendor_ids.map((id) => id.trim()).filter(Boolean))];
  }
  const single = body.vendor_id?.trim();
  return single ? [single] : [];
}

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertItemMasterAccess(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  const price = body.price;
  if (price === undefined || price === null || Number.isNaN(Number(price))) {
    return NextResponse.json({ error: "invalid_price" }, { status: 400 });
  }

  const vendorIds = parseVendorIds(body);
  if (!vendorIds.length) return NextResponse.json({ error: "missing_vendor" }, { status: 400 });

  const supabase = createServiceClient();
  const isCeo = await assertCeo(actorId!);

  if (!(await validateVendorIds(supabase, vendorIds))) {
    return NextResponse.json({ error: "invalid_vendor" }, { status: 400 });
  }

  const trackInventory = Boolean(body.track_inventory);
  let minStockThreshold: number | null = null;
  if (trackInventory && isCeo && body.min_stock_threshold !== undefined && body.min_stock_threshold !== null) {
    const n = Number(body.min_stock_threshold);
    if (Number.isNaN(n) || n < 0) {
      return NextResponse.json({ error: "invalid_min_stock_threshold" }, { status: 400 });
    }
    minStockThreshold = n;
  }

  const { data, error } = await supabase
    .from("items")
    .insert({
      name,
      price: Number(price),
      vendor_id: vendorIds[0],
      is_patient_linked: Boolean(body.is_patient_linked),
      is_active: body.is_active !== false,
      track_inventory: trackInventory,
      min_stock_threshold: minStockThreshold,
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  try {
    await syncItemVendors(supabase, data.id as string, vendorIds);
  } catch {
    await supabase.from("items").delete().eq("id", data.id as string);
    return NextResponse.json({ error: "vendor_link_failed" }, { status: 500 });
  }

  const vendorMap = Object.fromEntries(
    ((await supabase.from("vendors").select("id, name").in("id", vendorIds)).data ?? []).map((v) => [v.id, v.name]),
  );
  const vendorIdsByItem = new Map([[data.id as string, vendorIds]]);
  return NextResponse.json({ item: enrichItemRow(data, vendorIdsByItem, vendorMap) });
}
