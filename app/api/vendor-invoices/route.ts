import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { getVendorForUser } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const role = await getUserRole(actorId);
  const supabase = createServiceClient();

  let vendorId: string | null = null;
  if (role === "vendor") {
    const vendor = await getVendorForUser(actorId!);
    if (!vendor) return NextResponse.json({ invoices: [] });
    vendorId = (vendor as { id: string }).id;
  } else if (role !== "ceo" && role !== "ops") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let invoiceQuery = supabase.from("vendor_invoices").select("*").order("created_at", { ascending: false });
  if (vendorId) invoiceQuery = invoiceQuery.eq("vendor_id", vendorId);
  const { data: invoices, error: invoicesErr } = await invoiceQuery;
  if (invoicesErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const invoiceIds = (invoices ?? []).map((i) => i.id as string);
  const vendorIds = [...new Set((invoices ?? []).map((i) => i.vendor_id as string).filter(Boolean))];

  let items: Array<Record<string, unknown>> = [];
  if (invoiceIds.length) {
    const { data: invoiceItems, error: itemsErr } = await supabase
      .from("vendor_invoice_items")
      .select("*")
      .in("invoice_id", invoiceIds)
      .order("created_at", { ascending: false });
    if (itemsErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    items = (invoiceItems ?? []) as Array<Record<string, unknown>>;
  }

  const vendorNameMap = new Map<string, string>();
  if (vendorIds.length) {
    const { data: vendors } = await supabase.from("vendors").select("id, name").in("id", vendorIds);
    for (const vendor of vendors ?? []) {
      vendorNameMap.set(vendor.id as string, vendor.name as string);
    }
  }

  const groupedItems = new Map<string, Array<Record<string, unknown>>>();
  for (const item of items) {
    const invoiceId = item.invoice_id as string;
    const curr = groupedItems.get(invoiceId) ?? [];
    curr.push(item);
    groupedItems.set(invoiceId, curr);
  }

  const payload = (invoices ?? []).map((invoice) => {
    const invoiceId = invoice.id as string;
    const invoiceItems = groupedItems.get(invoiceId) ?? [];
    const totalAmount = invoiceItems.reduce((sum, item) => sum + Number(item.total_price ?? 0), 0);
    return {
      ...invoice,
      vendor_name: vendorNameMap.get(invoice.vendor_id as string) ?? "—",
      items: invoiceItems,
      item_count: invoiceItems.length,
      total_amount: totalAmount,
    };
  });

  return NextResponse.json({ invoices: payload });
}
