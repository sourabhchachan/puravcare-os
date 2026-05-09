import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { fileSuffixFromDates, rangeFromPreset } from "@/lib/dashboard/reportRange";

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

  const preset = url.searchParams.get("preset");
  const startQ = url.searchParams.get("start");
  const endQ = url.searchParams.get("end");
  const { start, end } = rangeFromPreset(preset, startQ, endQ);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const base = new URL("/api/master-bill", url.origin);
  for (const k of ["preset", "start", "end"]) {
    const v = url.searchParams.get(k);
    if (v) base.searchParams.set(k, v);
  }
  const res = await fetch(base.toString(), { headers: { "x-actor-id": actorId! } });
  if (!res.ok) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  const data = (await res.json()) as {
    by_patient: { uhid: string; patient_name: string; status: string; total_bill: number }[];
    by_item: { item_name: string; total_quantity: number; total_revenue: number }[];
    by_vendor: { vendor_name: string; total_items: number; total_revenue: number }[];
  };

  const rows =
    tab === "patient"
      ? data.by_patient.map((r) => ({
          "Patient Name": r.patient_name,
          UHID: r.uhid,
          "Total Bill ₹": asNumber(r.total_bill),
          Status: r.status,
        }))
      : tab === "item"
        ? data.by_item.map((r) => ({
            "Item Name": r.item_name,
            "Total Qty": asNumber(r.total_quantity),
            "Total Revenue ₹": asNumber(r.total_revenue),
          }))
        : data.by_vendor.map((r) => ({
            "Vendor Name": r.vendor_name,
            "Total Items": asNumber(r.total_items),
            "Total Revenue ₹": asNumber(r.total_revenue),
          }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, tab);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buf);

  const suffix = fileSuffixFromDates(start, end);
  const filename = `master-bill-${tab}-${suffix}.xlsx`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
