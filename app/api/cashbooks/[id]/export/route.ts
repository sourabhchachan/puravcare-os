import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
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

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
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
    .select("id, entry_type, amount, description, entry_date, created_by, created_at")
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

  let running = 0;
  const rows = (entryRows ?? []).map((e) => {
    const amt = Number(e.amount);
    const inn = e.entry_type === "in" ? amt : 0;
    const out = e.entry_type === "out" ? amt : 0;
    running += inn - out;
    return {
      Date: new Date(e.entry_date as string).toLocaleDateString(),
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

  const safeName = String(book.name).replace(/[^\w\-]+/g, "_").slice(0, 40);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}-cashbook.xlsx"`,
    },
  });
}
