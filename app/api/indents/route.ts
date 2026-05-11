import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { getVendorForUser } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  item_id?: string;
  quantity?: number | null;
  priority?: string;
  patient_id?: string | null;
};

type PatchBody = {
  indent_id?: string;
  action?: "block" | "cancel";
  block_reason?: string | null;
  cancel_reason?: string | null;
};

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const role = await getUserRole(actorId);

  let query = supabase.from("indents").select("*").order("created_at", { ascending: false });
  if (role === "vendor") {
    const vendor = await getVendorForUser(actorId!);
    if (!vendor) {
      return NextResponse.json({ indents: [], items: [] });
    }
    query = query.eq("vendor_id", (vendor as { id: string }).id);
  } else if (role !== "ceo" && role !== "ops") {
    query = query.eq("created_by", actorId!);
  }

  const [{ data: indents, error: indentsError }, { data: items, error: itemsError }, { data: patients, error: patientsError }] = await Promise.all([
    query,
    supabase.from("items").select("id, name, vendor_id").eq("is_active", true).not("vendor_id", "is", null).order("name"),
    supabase
      .from("patients")
      .select("id, full_name, ipd_number, uhid")
      .eq("status", "active")
      .eq("admission_type", "ipd")
      .order("full_name"),
  ]);

  if (indentsError || itemsError || patientsError) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const vendorIds = [
    ...new Set(
      [...(indents ?? []).map((i) => i.vendor_id as string), ...(items ?? []).map((i) => i.vendor_id as string)].filter(Boolean),
    ),
  ];
  const vendorNames = new Map<string, string>();
  if (vendorIds.length) {
    const { data: vendors } = await supabase.from("vendors").select("id, name").in("id", vendorIds);
    for (const v of vendors ?? []) {
      vendorNames.set(v.id as string, v.name as string);
    }
  }

  const patientIds = [...new Set((indents ?? []).map((i) => i.patient_id as string).filter(Boolean))];
  const patientIpd = new Map<string, string>();
  if (patientIds.length) {
    const { data: patients } = await supabase.from("patients").select("id, ipd_number").in("id", patientIds);
    for (const p of patients ?? []) {
      patientIpd.set(p.id as string, (p.ipd_number as string) ?? "—");
    }
  }

  const creatorIds = [...new Set((indents ?? []).map((i) => i.created_by as string).filter(Boolean))];
  const raisedBy = new Map<string, string>();
  if (creatorIds.length) {
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", creatorIds);
    for (const u of users ?? []) {
      raisedBy.set(u.id as string, u.full_name as string);
    }
  }

  return NextResponse.json({
    indents: (indents ?? []).map((row) => ({
      ...row,
      vendor_name: vendorNames.get(row.vendor_id as string) ?? "—",
      ipd_number: row.patient_id ? patientIpd.get(row.patient_id as string) ?? "—" : null,
      raised_by_name: raisedBy.get(row.created_by as string) ?? "—",
    })),
    items: (items ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      vendor_id: row.vendor_id,
      vendor_name: vendorNames.get(row.vendor_id as string) ?? "—",
    })),
    patients: (patients ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      ipd_number: (p.ipd_number as string | null) ?? (p.uhid as string | null) ?? "",
    })),
  });
}

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const itemId = (body.item_id ?? "").trim();
  if (!itemId) {
    return NextResponse.json({ error: "missing_item" }, { status: 400 });
  }

  const qty =
    body.quantity != null && !Number.isNaN(Number(body.quantity)) && Number(body.quantity) > 0 ? Number(body.quantity) : null;
  if (qty == null) {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  }
  const priority = (body.priority ?? "medium").trim().toLowerCase();
  if (!["critical", "high", "medium", "low"].includes(priority)) {
    return NextResponse.json({ error: "invalid_priority" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: item } = await supabase
    .from("items")
    .select("id, name, vendor_id")
    .eq("id", itemId)
    .eq("is_active", true)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "invalid_item" }, { status: 400 });
  }
  if (!item.vendor_id) {
    return NextResponse.json({ error: "item_without_vendor" }, { status: 400 });
  }

  const patientId = body.patient_id?.trim() || null;
  if (!patientId) {
    return NextResponse.json({ error: "missing_patient_id" }, { status: 400 });
  }
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("status", "active")
    .eq("admission_type", "ipd")
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: "invalid_patient" }, { status: 400 });

  const { data, error } = await supabase
    .from("indents")
    .insert({
      vendor_id: item.vendor_id,
      item_description: item.name,
      quantity: qty,
      priority,
      patient_id: patientId,
      status: "pending",
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
  const { error: eventErr } = await supabase.from("indent_events").insert({
    indent_id: data.id,
    actor_id: actorId!,
    event_type: "created",
    old_value: null,
    new_value: "pending",
    note: null,
  });
  if (eventErr) return NextResponse.json({ error: "event_log_failed" }, { status: 500 });
  return NextResponse.json({ indent: data });
}

export async function PATCH(request: Request) {
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

  const indentId = (body.indent_id ?? "").trim();
  if (!indentId) return NextResponse.json({ error: "missing_indent_id" }, { status: 400 });

  const action = body.action;
  if (!action || !["block", "cancel"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const role = await getUserRole(actorId);
  const { data: indent } = await supabase.from("indents").select("*").eq("id", indentId).maybeSingle();
  if (!indent) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const nowIso = new Date().toISOString();

  if (action === "block") {
    if (role !== "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!["pending", "dispatched"].includes(indent.status as string)) {
      return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    }
    const vendor = await getVendorForUser(actorId!);
    if (!vendor || (vendor as { id: string }).id !== (indent.vendor_id as string)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const reason = (body.block_reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "missing_block_reason" }, { status: 400 });
    const { data, error } = await supabase
      .from("indents")
      .update({
        status: "blocked",
        block_reason: reason,
        blocked_by: actorId!,
        blocked_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", indentId)
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ indent: data });
  }

  if (indent.status !== "pending") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  if (role !== "ceo" && indent.created_by !== actorId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const reason = (body.cancel_reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "missing_cancel_reason" }, { status: 400 });
  const { data, error } = await supabase
    .from("indents")
    .update({
      status: "cancelled",
      cancel_reason: reason,
      cancelled_by: actorId!,
      cancelled_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", indentId)
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ indent: data });
}
