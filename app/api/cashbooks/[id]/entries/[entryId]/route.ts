import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";
import { isEntryDateAllowed, parseEntryDate } from "@/lib/cashbook/entryDate";

type PatchBody = {
  entry_type?: string;
  amount?: number;
  description?: string | null;
  entry_date?: string;
  category_id?: string;
  payment_method_id?: string;
  customer_id?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id: cashbookId, entryId } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const isCeo = await assertCeo(actorId!);

  const { data: entry } = await supabase
    .from("cash_entries")
    .select("id, created_by, cashbook_id")
    .eq("id", entryId)
    .eq("cashbook_id", cashbookId)
    .maybeSingle();

  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: myMember } = await supabase
    .from("cashbook_members")
    .select("*")
    .eq("cashbook_id", cashbookId)
    .eq("user_id", actorId!)
    .maybeSingle();

  if (!isCeo && !myMember) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const role = isCeo ? "ceo" : (myMember!.role as string);
  const canEditAny = isCeo || role === "primary_admin" || role === "admin";
  const isOwner = entry.created_by === actorId;
  const canEditOwn = isCeo || Boolean(myMember?.can_edit_own);

  if (!canEditAny && !(isOwner && canEditOwn)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.entry_type === "string") {
    if (!["in", "out"].includes(body.entry_type)) return NextResponse.json({ error: "invalid_entry_type" }, { status: 400 });
    updates.entry_type = body.entry_type;
  }
  if (body.amount !== undefined && body.amount !== null) {
    const n = Number(body.amount);
    if (Number.isNaN(n) || n <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    updates.amount = n;
  }
  if (typeof body.description === "string") updates.description = body.description.trim() || null;

  if (body.category_id !== undefined) {
    const cid = String(body.category_id).trim();
    if (!cid) return NextResponse.json({ error: "invalid_category" }, { status: 400 });
    const { data: row } = await supabase.from("cashbook_categories").select("id").eq("id", cid).eq("is_active", true).maybeSingle();
    if (!row) return NextResponse.json({ error: "invalid_category" }, { status: 400 });
    updates.category_id = cid;
  }
  if (body.payment_method_id !== undefined) {
    const pid = String(body.payment_method_id).trim();
    if (!pid) return NextResponse.json({ error: "invalid_payment_method" }, { status: 400 });
    const { data: row } = await supabase.from("payment_methods").select("id").eq("id", pid).eq("is_active", true).maybeSingle();
    if (!row) return NextResponse.json({ error: "invalid_payment_method" }, { status: 400 });
    updates.payment_method_id = pid;
  }
  if (body.customer_id !== undefined) {
    const cuid = String(body.customer_id).trim();
    if (!cuid) return NextResponse.json({ error: "invalid_customer" }, { status: 400 });
    const { data: row } = await supabase.from("customers").select("id").eq("id", cuid).eq("is_active", true).maybeSingle();
    if (!row) return NextResponse.json({ error: "invalid_customer" }, { status: 400 });
    updates.customer_id = cuid;
  }

  if (typeof body.entry_date === "string" && body.entry_date.trim()) {
    const canBackdate = isCeo ? "always" : (myMember?.can_backdate as string) ?? "never";
    const entryDate = parseEntryDate(body.entry_date);
    if (!isEntryDateAllowed(entryDate, canBackdate)) {
      return NextResponse.json({ error: "invalid_entry_date" }, { status: 400 });
    }
    updates.entry_date = entryDate.toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  const { data: updated, error } = await supabase.from("cash_entries").update(updates).eq("id", entryId).select("*").single();

  if (error || !updated) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ entry: updated });
}
