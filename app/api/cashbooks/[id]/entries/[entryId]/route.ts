import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";
import { isEntryDateAllowed, parseEntryDate } from "@/lib/cashbook/entryDate";
import { calcPendingPayment, parseBillFields } from "@/lib/cashbook/entryBilling";

type PatchBody = {
  entry_type?: string;
  amount?: number;
  description?: string | null;
  entry_date?: string;
  category_id?: string;
  payment_method_id?: string;
  customer_id?: string;
  ipd_number?: string;
  is_patient_related?: boolean;
  is_billed_to_cobra?: boolean;
  total_bill_amount?: number;
  custom_fields?: Record<string, unknown>;
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
    .select("id, created_by, cashbook_id, entry_type, amount, ipd_number, is_patient_related, is_billed_to_cobra, total_bill_amount")
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
  if (!isCeo && myMember?.role === "viewer") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const canEditAny = isCeo;
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

  if (body.custom_fields !== undefined) {
    const { data: fieldRows, error: fieldsErr } = await supabase
      .from("cashbook_fields")
      .select("id, field_type, is_required")
      .eq("cashbook_id", cashbookId);
    if (fieldsErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    if (typeof body.custom_fields !== "object" || body.custom_fields === null || Array.isArray(body.custom_fields)) {
      return NextResponse.json({ error: "invalid_custom_fields" }, { status: 400 });
    }
    const defs = new Map((fieldRows ?? []).map((f) => [String(f.id), f]));
    const normalizedCustomFields: Record<string, string | number> = {};
    for (const [fieldId, rawValue] of Object.entries(body.custom_fields)) {
      const fieldDef = defs.get(fieldId);
      if (!fieldDef) return NextResponse.json({ error: "invalid_custom_fields" }, { status: 400 });
      if (rawValue === null || rawValue === undefined || rawValue === "") continue;
      if (fieldDef.field_type === "number") {
        const n = typeof rawValue === "number" ? rawValue : Number(rawValue);
        if (Number.isNaN(n)) return NextResponse.json({ error: "invalid_custom_fields" }, { status: 400 });
        normalizedCustomFields[fieldId] = n;
      } else {
        if (typeof rawValue !== "string") return NextResponse.json({ error: "invalid_custom_fields" }, { status: 400 });
        normalizedCustomFields[fieldId] = rawValue.trim();
      }
    }
    for (const f of fieldRows ?? []) {
      if (f.is_required && !(String(f.id) in normalizedCustomFields)) {
        return NextResponse.json({ error: "missing_required_custom_field" }, { status: 400 });
      }
    }
    updates.custom_fields = normalizedCustomFields;
  }

  const hasBillFieldUpdate =
    body.ipd_number !== undefined ||
    body.is_patient_related !== undefined ||
    body.is_billed_to_cobra !== undefined ||
    body.total_bill_amount !== undefined;

  if (hasBillFieldUpdate) {
    const billFields = parseBillFields({
      ipd_number: body.ipd_number !== undefined ? body.ipd_number : entry.ipd_number,
      is_patient_related: body.is_patient_related !== undefined ? body.is_patient_related : entry.is_patient_related,
      is_billed_to_cobra: body.is_billed_to_cobra !== undefined ? body.is_billed_to_cobra : entry.is_billed_to_cobra,
      total_bill_amount: body.total_bill_amount !== undefined ? body.total_bill_amount : entry.total_bill_amount,
    });
    if (!billFields.ok) return NextResponse.json({ error: billFields.error }, { status: 400 });
    updates.ipd_number = billFields.ipd_number;
    updates.is_patient_related = billFields.is_patient_related;
    updates.is_billed_to_cobra = billFields.is_billed_to_cobra;
    updates.total_bill_amount = billFields.total_bill_amount;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  const nextEntryType = (updates.entry_type ?? entry.entry_type) as "in" | "out";
  const nextAmount = updates.amount !== undefined ? Number(updates.amount) : Number(entry.amount);
  const nextTotalBill =
    updates.total_bill_amount !== undefined ? Number(updates.total_bill_amount) : Number(entry.total_bill_amount);
  updates.pending_payment = calcPendingPayment(nextEntryType, nextTotalBill, nextAmount);

  const { data: updated, error } = await supabase.from("cash_entries").update(updates).eq("id", entryId).select("*").single();

  if (error || !updated) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ entry: updated });
}
