import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { expiryWindowIso } from "@/lib/inventory/stockLevels";
import { getVendorIdsForUser } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(actorId);
  const supabase = createServiceClient();

  let vendorIds: string[] | null = null;
  if (role === "vendor") {
    const ids = await getVendorIdsForUser(actorId!);
    if (!ids.length) return NextResponse.json({ rows: [] });
    vendorIds = ids;
  } else if (!(await assertCeoOrOps(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { from, to } = expiryWindowIso();

  let stockQuery = supabase
    .from("inventory_stock")
    .select("id, item_id, quantity, batch_number, expiry_date, purchase_price, invoice_number, created_at, items(name, vendor_id)")
    .gte("expiry_date", from)
    .lte("expiry_date", to)
    .order("expiry_date", { ascending: true });

  const { data: stockRows, error } = await stockQuery;
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const rows = (stockRows ?? [])
    .filter((r) => {
      if (!vendorIds) return true;
      const rel = r.items as { vendor_id: string } | { vendor_id: string }[] | null;
      const item = Array.isArray(rel) ? rel[0] : rel;
      return item?.vendor_id != null && vendorIds.includes(item.vendor_id);
    })
    .map((r) => {
      const rel = r.items as { name: string; vendor_id: string } | { name: string; vendor_id: string }[] | null;
      const item = Array.isArray(rel) ? rel[0] : rel;
      return {
        id: r.id as string,
        item_id: r.item_id as string,
        item_name: item?.name ?? "—",
        quantity: r.quantity,
        batch_number: r.batch_number,
        expiry_date: r.expiry_date,
        purchase_price: r.purchase_price,
        invoice_number: r.invoice_number,
        created_at: r.created_at,
      };
    });

  return NextResponse.json({ rows });
}
