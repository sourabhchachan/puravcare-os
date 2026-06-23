import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertLinenStoreVendor, canViewLinen } from "@/lib/linen/access";
import { fetchLinenStockLevels } from "@/lib/linen/stockLevels";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  item_id?: string;
  quantity?: number;
  invoice_number?: string;
};

const LINEN_STOCK_PLACEHOLDER = {
  batch_number: "LINEN",
  expiry_date: "2099-12-31",
  purchase_price: 0,
};

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await canViewLinen(actorId!))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const supabase = createServiceClient();
  const role = await getUserRole(actorId);
  const vendor = role === "vendor" ? await assertLinenStoreVendor(actorId!) : null;

  const stock = await fetchLinenStockLevels(supabase, vendor ? { vendorId: vendor.id } : undefined);

  let txnQuery = supabase
    .from("linen_transactions")
    .select(
      "id, item_id, transaction_type, quantity, from_status, to_status, patient_id, location_id, indent_id, invoice_number, created_by, created_at, items(name), patients(full_name), locations(name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const itemFilter = url.searchParams.get("item_id");
  const typeFilter = url.searchParams.get("transaction_type");
  if (itemFilter) txnQuery = txnQuery.eq("item_id", itemFilter);
  if (typeFilter) txnQuery = txnQuery.eq("transaction_type", typeFilter);

  if (vendor) {
    const itemIds = stock.map((s) => s.item_id);
    if (itemIds.length) {
      txnQuery = txnQuery.in("item_id", itemIds);
    } else {
      txnQuery = txnQuery.eq("item_id", "00000000-0000-0000-0000-000000000000");
    }
  }

  const [{ data: txns, error: txnErr }, { data: followups, error: fuErr }] = await Promise.all([
    txnQuery,
    supabase
      .from("linen_followups")
      .select("id, item_id, quantity, source_type, source_id, status, resolution, resolution_note, created_at, items(name)")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
  ]);

  if (txnErr || fuErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const creatorIds = [...new Set((txns ?? []).map((t) => t.created_by as string).filter(Boolean))];
  let nameMap: Record<string, string> = {};
  if (creatorIds.length) {
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", creatorIds);
    nameMap = Object.fromEntries((users ?? []).map((u) => [u.id as string, u.full_name as string]));
  }

  const transactions = (txns ?? []).map((t) => {
    const itemRel = t.items as { name: string } | { name: string }[] | null;
    const patientRel = t.patients as { full_name: string } | { full_name: string }[] | null;
    const locRel = t.locations as { name: string } | { name: string }[] | null;
    const item = Array.isArray(itemRel) ? itemRel[0] : itemRel;
    const patient = Array.isArray(patientRel) ? patientRel[0] : patientRel;
    const loc = Array.isArray(locRel) ? locRel[0] : locRel;
    return {
      id: t.id,
      item_id: t.item_id,
      item_name: item?.name ?? "—",
      transaction_type: t.transaction_type,
      quantity: t.quantity,
      from_status: t.from_status,
      to_status: t.to_status,
      patient_name: patient?.full_name ?? null,
      location_name: loc?.name ?? null,
      invoice_number: t.invoice_number,
      created_by_name: nameMap[t.created_by as string] ?? "—",
      created_at: t.created_at,
    };
  });

  const openFollowups = (followups ?? [])
    .filter((f) => {
      if (!vendor) return true;
      return stock.some((s) => s.item_id === f.item_id);
    })
    .map((f) => {
      const itemRel = f.items as { name: string } | { name: string }[] | null;
      const item = Array.isArray(itemRel) ? itemRel[0] : itemRel;
      return {
        id: f.id,
        item_id: f.item_id,
        item_name: item?.name ?? "—",
        quantity: f.quantity,
        source_type: f.source_type,
        source_id: f.source_id,
        status: f.status,
        created_at: f.created_at,
      };
    });

  const { data: allItems } = await supabase
    .from("items")
    .select("id, name, vendor_id, vendors(category)")
    .eq("track_inventory", true)
    .eq("is_active", true)
    .order("name");

  const items = (allItems ?? []).filter((i) => {
    if (vendor && i.vendor_id !== vendor.id) return false;
    const rel = i.vendors as { category: string | null } | { category: string | null }[] | null;
    const v = Array.isArray(rel) ? rel[0] : rel;
    return (v?.category ?? "").toLowerCase() === "linen_store";
  });

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  const { data: pendingReturns } = await supabase
    .from("linen_returns")
    .select("id, item_id, quantity, patient_id, location_id, status, created_at, items(name), patients(full_name), locations(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return NextResponse.json({
    stock,
    followups: openFollowups,
    transactions,
    items: (items ?? []).map((i) => ({ id: i.id, name: i.name })),
    locations: locations ?? [],
    pending_returns: (pendingReturns ?? []).map((r) => {
      const itemRel = r.items as { name: string } | { name: string }[] | null;
      const patientRel = r.patients as { full_name: string } | { full_name: string }[] | null;
      const locRel = r.locations as { name: string } | { name: string }[] | null;
      return {
        id: r.id,
        item_id: r.item_id,
        item_name: (Array.isArray(itemRel) ? itemRel[0] : itemRel)?.name ?? "—",
        quantity: r.quantity,
        patient_name: (Array.isArray(patientRel) ? patientRel[0] : patientRel)?.full_name ?? null,
        location_name: (Array.isArray(locRel) ? locRel[0] : locRel)?.name ?? null,
        created_at: r.created_at,
      };
    }),
  });
}

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const vendor = await assertLinenStoreVendor(actorId!);
  if (!vendor) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const itemId = (body.item_id ?? "").trim();
  const invoiceNumber = (body.invoice_number ?? "").trim();
  const quantity = Number(body.quantity);

  if (!itemId) return NextResponse.json({ error: "missing_item_id" }, { status: 400 });
  if (!invoiceNumber) return NextResponse.json({ error: "missing_invoice_number" }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: item } = await supabase
    .from("items")
    .select("id, vendor_id, track_inventory, is_active")
    .eq("id", itemId)
    .maybeSingle();

  if (!item || !item.is_active) return NextResponse.json({ error: "invalid_item" }, { status: 400 });
  if (item.vendor_id !== vendor.id) return NextResponse.json({ error: "item_not_for_vendor" }, { status: 403 });
  if (!item.track_inventory) return NextResponse.json({ error: "inventory_not_tracked" }, { status: 400 });

  const { data: stockRow, error: stockErr } = await supabase
    .from("inventory_stock")
    .insert({
      item_id: itemId,
      quantity,
      ...LINEN_STOCK_PLACEHOLDER,
      invoice_number: invoiceNumber,
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (stockErr || !stockRow) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  const { data: txn, error: txnErr } = await supabase
    .from("linen_transactions")
    .insert({
      item_id: itemId,
      transaction_type: "stock_in",
      quantity,
      from_status: null,
      to_status: "in_store",
      inventory_stock_id: stockRow.id as string,
      invoice_number: invoiceNumber,
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (txnErr || !txn) {
    await supabase.from("inventory_stock").delete().eq("id", stockRow.id as string);
    return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
  }

  return NextResponse.json({ stock: stockRow, transaction: txn });
}
