import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { fetchStockLevels } from "@/lib/inventory/stockLevels";
import { getVendorForUser } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  item_id?: string;
  quantity?: number;
  batch_number?: string;
  expiry_date?: string;
  purchase_price?: number;
  invoice_number?: string;
};

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(actorId);
  const supabase = createServiceClient();

  try {
    if (role === "vendor") {
      const vendor = await getVendorForUser(actorId!);
      if (!vendor) return NextResponse.json({ items: [] });
      const levels = await fetchStockLevels(supabase, { vendorId: (vendor as { id: string }).id });
      return NextResponse.json({ items: levels });
    }
    if (!(await assertCeoOrOps(actorId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const levels = await fetchStockLevels(supabase);
    return NextResponse.json({ items: levels });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if ((await getUserRole(actorId)) !== "vendor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const vendor = await getVendorForUser(actorId!);
  if (!vendor) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const itemId = (body.item_id ?? "").trim();
  const batchNumber = (body.batch_number ?? "").trim();
  const expiryDate = (body.expiry_date ?? "").trim();
  const invoiceNumber = (body.invoice_number ?? "").trim();
  const quantity = Number(body.quantity);
  const purchasePrice = Number(body.purchase_price);

  if (!itemId) return NextResponse.json({ error: "missing_item_id" }, { status: 400 });
  if (!batchNumber) return NextResponse.json({ error: "missing_batch_number" }, { status: 400 });
  if (!expiryDate || Number.isNaN(Date.parse(expiryDate))) {
    return NextResponse.json({ error: "invalid_expiry_date" }, { status: 400 });
  }
  if (!invoiceNumber) return NextResponse.json({ error: "missing_invoice_number" }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  }
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
    return NextResponse.json({ error: "invalid_purchase_price" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const vendorId = (vendor as { id: string }).id;

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, vendor_id, track_inventory, is_active")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  if (!item || !item.is_active) return NextResponse.json({ error: "invalid_item" }, { status: 400 });
  if (item.vendor_id !== vendorId) return NextResponse.json({ error: "item_not_for_vendor" }, { status: 403 });
  if (!item.track_inventory) return NextResponse.json({ error: "inventory_not_tracked" }, { status: 400 });

  const { data: stockRow, error: stockErr } = await supabase
    .from("inventory_stock")
    .insert({
      item_id: itemId,
      quantity,
      batch_number: batchNumber,
      expiry_date: expiryDate,
      purchase_price: purchasePrice,
      invoice_number: invoiceNumber,
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (stockErr || !stockRow) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  const { data: txn, error: txnErr } = await supabase
    .from("inventory_transactions")
    .insert({
      item_id: itemId,
      transaction_type: "stock_in",
      quantity,
      reference_id: stockRow.id as string,
      inventory_stock_id: stockRow.id as string,
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
