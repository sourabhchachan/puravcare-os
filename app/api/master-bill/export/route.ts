import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { assertActiveUser, getActorId } from "@/lib/api/actor";

function asNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const tab = (url.searchParams.get("tab") ?? "patient").toLowerCase();
  if (!["patient", "item", "vendor"].includes(tab)) {
    return NextResponse.json({ error: "invalid_tab" }, { status: 400 });
  }

  const base = new URL("/api/master-bill", url.origin);
  for (const k of ["preset", "start", "end"]) {
    const v = url.searchParams.get(k);
    if (v) base.searchParams.set(k, v);
  }
  const res = await fetch(base.toString(), { headers: { "x-actor-id": actorId! } });
  if (!res.ok) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  const data = (await res.json()) as {
    by_patient: { uhid: string; patient_name: string; total_bill: number }[];
    by_item: { item_name: string; total_quantity: number; total_revenue: number }[];
    by_vendor: { vendor_name: string; total_quantity: number; total_revenue: number }[];
  };

  const rows =
    tab === "patient"
      ? data.by_patient.map((r) => ({ UHID: r.uhid, Patient: r.patient_name, "Total Bill (INR)": asNumber(r.total_bill) }))
      : tab === "item"
        ? data.by_item.map((r) => ({
            Item: r.item_name,
            "Total Quantity": asNumber(r.total_quantity),
            "Total Revenue (INR)": asNumber(r.total_revenue),
          }))
        : data.by_vendor.map((r) => ({
            Vendor: r.vendor_name,
            "Total Quantity": asNumber(r.total_quantity),
            "Total Revenue (INR)": asNumber(r.total_revenue),
          }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, tab);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buf);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="master-bill-${tab}.xlsx"`,
    },
  });
}
