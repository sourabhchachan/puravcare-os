import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { fileSuffixFromDates, rangeFromPreset } from "@/lib/dashboard/reportRange";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: patientId } = await params;
  const url = new URL(request.url);
  const preset = url.searchParams.get("preset") ?? "this_month";
  const startQ = url.searchParams.get("start");
  const endQ = url.searchParams.get("end");
  const { start, end } = rangeFromPreset(preset, startQ, endQ);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: patient, error: pErr } = await supabase
    .from("patients")
    .select("id, uhid, full_name")
    .eq("id", patientId)
    .maybeSingle();
  if (pErr || !patient) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: billRows, error } = await supabase
    .from("billable_items")
    .select("item_id, quantity, unit_price, total_price, status, billed_at")
    .eq("patient_id", patientId)
    .gte("billed_at", start.toISOString())
    .lte("billed_at", end.toISOString())
    .order("billed_at", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const itemIds = [...new Set((billRows ?? []).map((r) => r.item_id as string).filter(Boolean))];
  const { data: items } = itemIds.length
    ? await supabase.from("items").select("id, name").in("id", itemIds)
    : { data: [] };
  const itemName = Object.fromEntries((items ?? []).map((i) => [i.id, i.name as string]));

  const rows = (billRows ?? []).map((r) => ({
    Item: itemName[r.item_id as string] ?? "—",
    Qty: Number(r.quantity ?? 0),
    "Unit Price": Number(r.unit_price ?? 0),
    Total: Number(r.total_price ?? 0),
    Status: r.status,
    Date: new Date(r.billed_at as string).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Item: "" }]);
  XLSX.utils.book_append_sheet(wb, ws, "Bill");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buf);

  const uhid = String(patient.uhid).replace(/[^\w\-]+/g, "_").slice(0, 20);
  const suffix = fileSuffixFromDates(start, end);
  const filename = `patient-bill-${uhid}-${suffix}.xlsx`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
