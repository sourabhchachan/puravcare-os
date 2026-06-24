import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { fileSuffixFromDates, slugFilePart } from "@/lib/dashboard/reportRange";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cashbookId } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start")?.trim();
  const end = url.searchParams.get("end")?.trim();
  if (!start || !end) {
    return NextResponse.json({ error: "missing_range" }, { status: 400 });
  }

  const startD = new Date(start);
  const endD = new Date(end);
  const startMs = startD.getTime();
  const endMs = endD.getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const isCeo = await assertCeo(actorId!);

  const { data: myMember } = await supabase
    .from("cashbook_members")
    .select("*")
    .eq("cashbook_id", cashbookId)
    .eq("user_id", actorId!)
    .maybeSingle();

  if (!isCeo && !myMember) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: book } = await supabase.from("cashbooks").select("name").eq("id", cashbookId).maybeSingle();
  if (!book) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const hideOthers = !isCeo && myMember?.role === "data_operator" && Boolean(myMember.hide_others_entries);

  let q = supabase
    .from("cash_entries")
    .select(
      "id, entry_type, amount, description, entry_date, created_by, created_at, category_id, payment_method_id, customer_id, ipd_number, is_patient_related, is_billed_to_cobra, total_bill_amount, pending_payment",
    )
    .eq("cashbook_id", cashbookId)
    .gte("entry_date", new Date(startMs).toISOString())
    .lte("entry_date", new Date(endMs).toISOString())
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (hideOthers) {
    q = q.eq("created_by", actorId!);
  }

  const { data: entryRows, error } = await q;
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const creatorIds = [...new Set((entryRows ?? []).map((e) => e.created_by as string))];
  let nameMap: Record<string, string> = {};
  if (creatorIds.length) {
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", creatorIds);
    nameMap = Object.fromEntries((users ?? []).map((u) => [u.id as string, u.full_name as string]));
  }

  const catIds = [...new Set((entryRows ?? []).map((e) => e.category_id as string | null).filter(Boolean))] as string[];
  const pmIds = [...new Set((entryRows ?? []).map((e) => e.payment_method_id as string | null).filter(Boolean))] as string[];
  const custIds = [...new Set((entryRows ?? []).map((e) => e.customer_id as string | null).filter(Boolean))] as string[];

  let catMap: Record<string, string> = {};
  let pmMap: Record<string, string> = {};
  let custMap: Record<string, string> = {};
  if (catIds.length) {
    const { data: cats } = await supabase.from("cashbook_categories").select("id, name").in("id", catIds);
    catMap = Object.fromEntries((cats ?? []).map((c) => [c.id as string, c.name as string]));
  }
  if (pmIds.length) {
    const { data: pms } = await supabase.from("payment_methods").select("id, name").in("id", pmIds);
    pmMap = Object.fromEntries((pms ?? []).map((p) => [p.id as string, p.name as string]));
  }
  if (custIds.length) {
    const { data: custs } = await supabase.from("customers").select("id, name").in("id", custIds);
    custMap = Object.fromEntries((custs ?? []).map((c) => [c.id as string, c.name as string]));
  }

  let running = 0;
  const rows = (entryRows ?? []).map((e) => {
    const amt = Number(e.amount);
    const inn = e.entry_type === "in" ? amt : 0;
    const out = e.entry_type === "out" ? amt : 0;
    running += inn - out;
    return {
      Date: new Date(e.entry_date as string).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      Category: e.category_id ? (catMap[e.category_id as string] ?? "—") : "—",
      "Payment Method": e.payment_method_id ? (pmMap[e.payment_method_id as string] ?? "—") : "—",
      Customer: e.customer_id ? (custMap[e.customer_id as string] ?? "—") : "—",
      "IPD Number": (e.ipd_number as string) ?? "",
      "Patient Related": e.is_patient_related ? "Yes" : "No",
      "Bills Added to Cobra": e.is_billed_to_cobra ? "Yes" : "No",
      "Total Bill Amount": Number(e.total_bill_amount ?? 0),
      "Pending Payment": Number(e.pending_payment ?? 0),
      Description: (e.description as string) ?? "",
      IN: inn || "",
      OUT: out || "",
      Balance: running,
      "Entered By": nameMap[e.created_by as string] ?? "—",
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Entries");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buf);

  const slug = slugFilePart(String(book.name), 32);
  const suffix = fileSuffixFromDates(startD, endD);
  const filename = `cashbook-${slug}-${suffix}.xlsx`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
