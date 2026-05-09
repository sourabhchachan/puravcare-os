import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { rangeFromPreset } from "@/lib/dashboard/reportRange";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const preset = url.searchParams.get("preset");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const { start: startDate, end: endDate } = rangeFromPreset(preset, start, end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: billRows, error } = await supabase
    .from("billable_items")
    .select("patient_id, item_id, quantity, unit_price, total_price, billed_at, status")
    .gte("billed_at", startDate.toISOString())
    .lte("billed_at", endDate.toISOString());
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const rows = (billRows ?? []).filter((r) => r.status === "active");
  const patientIds = [...new Set(rows.map((r) => r.patient_id as string).filter(Boolean))];
  const itemIds = [...new Set(rows.map((r) => r.item_id as string).filter(Boolean))];

  const [{ data: patients }, { data: items }] = await Promise.all([
    patientIds.length
      ? supabase.from("patients").select("id, uhid, full_name, status").in("id", patientIds)
      : Promise.resolve({ data: [] }),
    itemIds.length ? supabase.from("items").select("id, name, vendor_id").in("id", itemIds) : Promise.resolve({ data: [] }),
  ]);

  const itemVendorIds = [...new Set(((items ?? []) as { vendor_id: string | null }[]).map((i) => i.vendor_id).filter(Boolean))] as string[];
  const { data: vendors } = itemVendorIds.length
    ? await supabase.from("vendors").select("id, name").in("id", itemVendorIds)
    : { data: [] as { id: string; name: string }[] };

  const patientMap = new Map<string, { uhid: string; full_name: string; status: string }>();
  for (const p of (patients ?? []) as { id: string; uhid: string; full_name: string; status: string }[]) {
    patientMap.set(p.id, { uhid: p.uhid, full_name: p.full_name, status: p.status });
  }
  const itemMap = new Map<string, { name: string; vendor_id: string | null }>();
  for (const i of (items ?? []) as { id: string; name: string; vendor_id: string | null }[]) {
    itemMap.set(i.id, { name: i.name, vendor_id: i.vendor_id });
  }
  const vendorMap = new Map<string, string>();
  for (const v of (vendors ?? []) as { id: string; name: string }[]) {
    vendorMap.set(v.id, v.name);
  }

  const byPatient = new Map<
    string,
    { patient_id: string; uhid: string; patient_name: string; status: string; total_bill: number }
  >();
  const byItem = new Map<string, { item_id: string; item_name: string; total_quantity: number; total_revenue: number }>();
  const byVendor = new Map<
    string,
    { vendor_id: string; vendor_name: string; total_items: number; total_revenue: number }
  >();

  for (const r of rows) {
    const total = Number(r.total_price ?? 0);
    const quantity = Number(r.quantity ?? 0);
    const patient = patientMap.get(r.patient_id as string);
    const item = itemMap.get(r.item_id as string);

    const pKey = r.patient_id as string;
    const currentP = byPatient.get(pKey) ?? {
      patient_id: pKey,
      uhid: patient?.uhid ?? "—",
      patient_name: patient?.full_name ?? "Unknown",
      status: patient?.status ?? "—",
      total_bill: 0,
    };
    currentP.total_bill += total;
    byPatient.set(pKey, currentP);

    const iKey = r.item_id as string;
    const currentI = byItem.get(iKey) ?? {
      item_id: iKey,
      item_name: item?.name ?? "Unknown",
      total_quantity: 0,
      total_revenue: 0,
    };
    currentI.total_quantity += quantity;
    currentI.total_revenue += total;
    byItem.set(iKey, currentI);

    const vendorId = item?.vendor_id;
    if (vendorId) {
      const currentV = byVendor.get(vendorId) ?? {
        vendor_id: vendorId,
        vendor_name: vendorMap.get(vendorId) ?? "Unknown",
        total_items: 0,
        total_revenue: 0,
      };
      currentV.total_items += 1;
      currentV.total_revenue += total;
      byVendor.set(vendorId, currentV);
    }
  }

  return NextResponse.json({
    by_patient: Array.from(byPatient.values()).sort((a, b) => b.total_bill - a.total_bill),
    by_item: Array.from(byItem.values()).sort((a, b) => b.total_revenue - a.total_revenue),
    by_vendor: Array.from(byVendor.values()).sort((a, b) => b.total_revenue - a.total_revenue),
  });
}
