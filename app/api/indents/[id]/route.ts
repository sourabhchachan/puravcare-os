import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { canViewVendor } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = {
  action?: string;
  reason?: string | null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = body.action;
  if (!["dispatch", "deliver", "cancel", "receive", "block"].includes(action ?? "")) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: row, error: fe } = await supabase.from("indents").select("*").eq("id", id).maybeSingle();
  if (fe || !row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const vendorId = row.vendor_id as string;
  const role = await getUserRole(actorId);
  const nowIso = new Date().toISOString();

  if (action === "cancel") {
    if (role === "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const isCreator =
      row.created_by != null && actorId != null && String(row.created_by) === String(actorId);
    if (!(await assertCeoOrOps(actorId)) && !isCreator) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (row.status !== "pending") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    const reason = (body.reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "missing_reason" }, { status: 400 });

    const oldStatus = row.status as string;
    const { data, error } = await supabase
      .from("indents")
      .update({
        status: "cancelled",
        cancel_reason: reason,
        cancelled_by: actorId!,
        cancelled_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    const { error: eventErr } = await supabase.from("indent_events").insert({
      indent_id: id,
      actor_id: actorId!,
      event_type: "cancel",
      old_value: oldStatus,
      new_value: "cancelled",
      note: reason,
    });
    if (eventErr) return NextResponse.json({ error: "event_log_failed" }, { status: 500 });
    return NextResponse.json({ indent: data });
  }

  if (action === "block") {
    if (role !== "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!["pending", "dispatched"].includes(row.status as string)) {
      return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    }
    const { data: link } = await supabase.from("vendor_users").select("vendor_id").eq("user_id", actorId!).maybeSingle();
    if (!link || link.vendor_id !== vendorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const reason = (body.reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "missing_reason" }, { status: 400 });

    const oldStatus = row.status as string;
    const { data, error } = await supabase
      .from("indents")
      .update({
        status: "blocked",
        block_reason: reason,
        blocked_by: actorId!,
        blocked_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    const { error: eventErr } = await supabase.from("indent_events").insert({
      indent_id: id,
      actor_id: actorId!,
      event_type: "block",
      old_value: oldStatus,
      new_value: "blocked",
      note: reason,
    });
    if (eventErr) return NextResponse.json({ error: "event_log_failed" }, { status: 500 });
    return NextResponse.json({ indent: data, message: "Indent blocked" });
  }

  if (action === "receive") {
    const isCreator =
      row.created_by != null && actorId != null && String(row.created_by) === String(actorId);
    if (!(await assertCeoOrOps(actorId)) && !isCreator) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (row.status !== "dispatched") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    if (!row.patient_id) return NextResponse.json({ error: "missing_patient" }, { status: 400 });

    const oldStatus = row.status as string;
    const { data: deliveredRow, error: deliveredErr } = await supabase
      .from("indents")
      .update({
        status: "delivered",
        received_by: actorId!,
        received_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (deliveredErr || !deliveredRow) return NextResponse.json({ error: "update_failed" }, { status: 500 });

    const { error: billableErr } = await supabase.from("billable_items").insert({
      patient_id: row.patient_id,
      item_id: null,
      quantity: row.quantity,
      unit_price: null,
      total_price: null,
      billed_by: actorId!,
      billed_at: nowIso,
      note: row.item_description,
      status: "pending",
    });
    if (billableErr) return NextResponse.json({ error: "billable_create_failed" }, { status: 500 });

    let invoiceId: string | null = null;
    const { data: openInvoice, error: openInvoiceErr } = await supabase
      .from("vendor_invoices")
      .select("id")
      .eq("vendor_id", vendorId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openInvoiceErr) return NextResponse.json({ error: "invoice_fetch_failed" }, { status: 500 });
    if (openInvoice?.id) {
      invoiceId = openInvoice.id as string;
    } else {
      const { data: createdInvoice, error: createInvoiceErr } = await supabase
        .from("vendor_invoices")
        .insert({
          vendor_id: vendorId,
          status: "open",
          created_by: actorId!,
        })
        .select("id")
        .single();
      if (createInvoiceErr || !createdInvoice) {
        return NextResponse.json({ error: "invoice_create_failed" }, { status: 500 });
      }
      invoiceId = createdInvoice.id as string;
    }

    const { error: invoiceItemErr } = await supabase.from("vendor_invoice_items").insert({
      invoice_id: invoiceId,
      indent_id: row.id,
      description: row.item_description,
      quantity: row.quantity,
      unit_price: null,
      total_price: 0,
    });
    if (invoiceItemErr) return NextResponse.json({ error: "invoice_item_create_failed" }, { status: 500 });
    const { error: eventErr } = await supabase.from("indent_events").insert({
      indent_id: id,
      actor_id: actorId!,
      event_type: "receive",
      old_value: oldStatus,
      new_value: "delivered",
      note: null,
    });
    if (eventErr) return NextResponse.json({ error: "event_log_failed" }, { status: 500 });

    return NextResponse.json({
      indent: deliveredRow,
      message: "Indent received and added to billing/invoice",
    });
  }

  if (!(await canViewVendor(actorId!, vendorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (action === "dispatch") {
    if (row.status !== "pending") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    if (role === "vendor") {
      const { data: link } = await supabase.from("vendor_users").select("vendor_id").eq("user_id", actorId!).maybeSingle();
      if (!link || link.vendor_id !== vendorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    } else if (!(await assertCeoOrOps(actorId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const oldStatus = row.status as string;
    const { data, error } = await supabase
      .from("indents")
      .update({ status: "dispatched", updated_at: nowIso })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    const { error: eventErr } = await supabase.from("indent_events").insert({
      indent_id: id,
      actor_id: actorId!,
      event_type: "dispatch",
      old_value: oldStatus,
      new_value: "dispatched",
      note: null,
    });
    if (eventErr) return NextResponse.json({ error: "event_log_failed" }, { status: 500 });
    return NextResponse.json({ indent: data });
  }

  /* deliver */
  if (!(await assertCeoOrOps(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (row.status !== "dispatched") return NextResponse.json({ error: "invalid_state" }, { status: 400 });

  const { data, error } = await supabase
    .from("indents")
    .update({ status: "delivered", updated_at: nowIso })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ indent: data });
}
