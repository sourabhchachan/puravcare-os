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

function parseVendorIds(body: { vendor_id?: string | null; vendor_ids?: string[] }): string[] | null {
  if (body.vendor_ids !== undefined) {
    if (!Array.isArray(body.vendor_ids)) return [];
    return [...new Set(body.vendor_ids.map((id) => id.trim()).filter(Boolean))];
  }
  if ("vendor_id" in body) {
    const single = body.vendor_id?.trim();
    return single ? [single] : [];
  }
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertItemMasterAccess(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: item, error } = await supabase
    .from("items")
    .select("id, name, price, vendor_id, is_patient_linked, is_active, track_inventory, min_stock_threshold, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const vendorIdsByItem = await fetchItemVendorLinks(supabase, [id]);
  const vendorIds = vendorIdsByItem.get(id) ?? [];
  const { data: vendors } = vendorIds.length
    ? await supabase.from("vendors").select("id, name").in("id", vendorIds)
    : { data: [] };
  const vendorMap = Object.fromEntries((vendors ?? []).map((v) => [v.id, v.name]));

  return NextResponse.json({ item: enrichItemRow(item, vendorIdsByItem, vendorMap) });
}

type PatchBody = {
  name?: string;
  price?: number;
  vendor_id?: string | null;
  vendor_ids?: string[];
  is_patient_linked?: boolean;
  is_active?: boolean;
  track_inventory?: boolean;
  min_stock_threshold?: number | null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertItemMasterAccess(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const isCeo = await assertCeo(actorId!);
  const supabase = createServiceClient();

  const { data: existing } = await supabase.from("items").select("id").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (body.price !== undefined && body.price !== null) {
    const n = Number(body.price);
    if (Number.isNaN(n)) return NextResponse.json({ error: "invalid_price" }, { status: 400 });
    updates.price = n;
  }
  if (typeof body.is_patient_linked === "boolean") updates.is_patient_linked = body.is_patient_linked;
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (typeof body.track_inventory === "boolean") {
    updates.track_inventory = body.track_inventory;
    if (!body.track_inventory) updates.min_stock_threshold = null;
  }
  if (isCeo && "min_stock_threshold" in body) {
    if (body.min_stock_threshold === null) {
      updates.min_stock_threshold = null;
    } else if (body.min_stock_threshold !== undefined) {
      const n = Number(body.min_stock_threshold);
      if (Number.isNaN(n) || n < 0) {
        return NextResponse.json({ error: "invalid_min_stock_threshold" }, { status: 400 });
      }
      updates.min_stock_threshold = n;
    }
  }

  const vendorIds = parseVendorIds(body);
  if (vendorIds !== null) {
    if (!vendorIds.length) return NextResponse.json({ error: "missing_vendor" }, { status: 400 });
    if (!(await validateVendorIds(supabase, vendorIds))) {
      return NextResponse.json({ error: "invalid_vendor" }, { status: 400 });
    }
    updates.vendor_id = vendorIds[0];
  }

  if (Object.keys(updates).length === 0 && vendorIds === null) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  if (typeof updates.name === "string") {
    const { data: others } = await supabase.from("items").select("id, name").neq("id", id);
    const taken = (others ?? []).some((r) => r.name && r.name.toLowerCase() === (updates.name as string).toLowerCase());
    if (taken) return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
  }

  let data = null;
  if (Object.keys(updates).length) {
    const res = await supabase.from("items").update(updates).eq("id", id).select("*").single();
    if (res.error) {
      if (res.error.code === "23505") return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
    data = res.data;
  } else {
    const res = await supabase.from("items").select("*").eq("id", id).maybeSingle();
    if (res.error || !res.data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    data = res.data;
  }

  if (vendorIds !== null) {
    try {
      await syncItemVendors(supabase, id, vendorIds);
    } catch {
      return NextResponse.json({ error: "vendor_link_failed" }, { status: 500 });
    }
  }

  const vendorIdsByItem = await fetchItemVendorLinks(supabase, [id]);
  const linkedIds = vendorIdsByItem.get(id) ?? [];
  const { data: vendors } = linkedIds.length
    ? await supabase.from("vendors").select("id, name").in("id", linkedIds)
    : { data: [] };
  const vendorMap = Object.fromEntries((vendors ?? []).map((v) => [v.id, v.name]));

  return NextResponse.json({ item: enrichItemRow(data, vendorIdsByItem, vendorMap) });
}
