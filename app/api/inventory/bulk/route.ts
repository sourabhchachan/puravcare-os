import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { getVendorForUser } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

type BulkRow = {
  item_name?: string;
  quantity?: number;
  batch_number?: string;
  expiry_date?: string;
  purchase_price?: number;
  invoice_number?: string;
};

type Failure = {
  index: number;
  item_name: string;
  reason: string;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

async function insertStockIn(
  supabase: ReturnType<typeof createServiceClient>,
  actorId: string,
  itemId: string,
  row: {
    quantity: number;
    batch_number: string;
    expiry_date: string;
    purchase_price: number;
    invoice_number: string;
  }
) {
  const { data: stockRow, error: stockErr } = await supabase
    .from("inventory_stock")
    .insert({
      item_id: itemId,
      quantity: row.quantity,
      batch_number: row.batch_number,
      expiry_date: row.expiry_date,
      purchase_price: row.purchase_price,
      invoice_number: row.invoice_number,
      created_by: actorId,
    })
    .select("*")
    .single();

  if (stockErr || !stockRow) {
    return { ok: false as const, reason: "insert_failed" };
  }

  const { data: txn, error: txnErr } = await supabase
    .from("inventory_transactions")
    .insert({
      item_id: itemId,
      transaction_type: "stock_in",
      quantity: row.quantity,
      reference_id: stockRow.id as string,
      inventory_stock_id: stockRow.id as string,
      created_by: actorId,
    })
    .select("*")
    .single();

  if (txnErr || !txn) {
    await supabase.from("inventory_stock").delete().eq("id", stockRow.id as string);
    return { ok: false as const, reason: "transaction_failed" };
  }

  return { ok: true as const };
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

  let body: { rows?: BulkRow[] };
  try {
    body = (await request.json()) as { rows?: BulkRow[] };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "missing_rows" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const vendorId = (vendor as { id: string }).id;

  const { data: vendorItems, error: itemsErr } = await supabase
    .from("items")
    .select("id, name, track_inventory, is_active")
    .eq("vendor_id", vendorId)
    .eq("track_inventory", true)
    .eq("is_active", true);

  if (itemsErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const itemByName = new Map<string, { id: string }>();
  for (const item of vendorItems ?? []) {
    itemByName.set(normalizeName(item.name as string), { id: item.id as string });
  }

  let succeeded = 0;
  const failures: Failure[] = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    const itemName = (row.item_name ?? "").trim();
    const batchNumber = (row.batch_number ?? "").trim();
    const expiryDate = (row.expiry_date ?? "").trim();
    const invoiceNumber = (row.invoice_number ?? "").trim();
    const quantity = Number(row.quantity);
    const purchasePrice = Number(row.purchase_price);

    if (!itemName) {
      failures.push({ index, item_name: itemName || "(empty)", reason: "missing_item_name" });
      continue;
    }

    const matched = itemByName.get(normalizeName(itemName));
    if (!matched) {
      failures.push({ index, item_name: itemName, reason: "item_not_for_vendor" });
      continue;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      failures.push({ index, item_name: itemName, reason: "invalid_quantity" });
      continue;
    }
    if (!batchNumber) {
      failures.push({ index, item_name: itemName, reason: "missing_batch_number" });
      continue;
    }
    if (!expiryDate || Number.isNaN(Date.parse(expiryDate))) {
      failures.push({ index, item_name: itemName, reason: "invalid_expiry_date" });
      continue;
    }
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      failures.push({ index, item_name: itemName, reason: "invalid_purchase_price" });
      continue;
    }
    if (!invoiceNumber) {
      failures.push({ index, item_name: itemName, reason: "missing_invoice_number" });
      continue;
    }

    const result = await insertStockIn(supabase, actorId!, matched.id, {
      quantity,
      batch_number: batchNumber,
      expiry_date: expiryDate,
      purchase_price: purchasePrice,
      invoice_number: invoiceNumber,
    });

    if (!result.ok) {
      failures.push({ index, item_name: itemName, reason: result.reason });
      continue;
    }

    succeeded++;
  }

  return NextResponse.json({
    succeeded,
    failed: failures.length,
    failures,
  });
}
