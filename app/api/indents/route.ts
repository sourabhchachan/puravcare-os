import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { isLinenItem } from "@/lib/linen/access";
import { canViewVendor, getVendorIdsForUser } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  item_id?: string;
  vendor_id?: string;
  quantity?: number | null;
  priority?: string;
  patient_id?: string | null;
  location_id?: string | null;
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
    const vendorIds = await getVendorIdsForUser(actorId!);
    if (!vendorIds.length) {
      return NextResponse.json({ indents: [], items: [] });
    }
    query = query.in("vendor_id", vendorIds);
  } else if (role !== "ceo" && role !== "ops") {
    query = query.eq("created_by", actorId!);
  }

  const [{ data: indents, error: indentsError }, { data: itemRows, error: itemsError }, { data: patients, error: patientsError }, { data: locations, error: locationsError }] =
    await Promise.all([
    query,
    supabase.from("items").select("id, name, vendor_id, track_inventory").eq("is_active", true).order("name"),
    supabase
      .from("patients")
      .select("id, full_name, ipd_number, uhid")
      .eq("status", "active")
      .eq("admission_type", "ipd")
      .order("full_name"),
    supabase.from("locations").select("id, name").eq("is_active", true).order("name"),
  ]);

  if (indentsError || itemsError || patientsError || locationsError) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const activeItemIds = (itemRows ?? []).map((i) => i.id as string);
  const { data: vendorLinks, error: linksError } = activeItemIds.length
    ? await supabase.from("item_vendors").select("item_id, vendor_id").in("item_id", activeItemIds)
    : { data: [], error: null };
  if (linksError) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const vendorsByItem = new Map<string, string[]>();
  for (const link of vendorLinks ?? []) {
    const itemId = link.item_id as string;
    const vendorId = link.vendor_id as string;
    const list = vendorsByItem.get(itemId) ?? [];
    list.push(vendorId);
    vendorsByItem.set(itemId, list);
  }

  const vendorIds = [
    ...new Set(
      [
        ...(indents ?? []).map((i) => i.vendor_id as string),
        ...(vendorLinks ?? []).map((l) => l.vendor_id as string),
        ...(itemRows ?? []).map((i) => i.vendor_id as string),
      ].filter(Boolean),
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
    items: (itemRows ?? [])
      .map((row) => {
        const linkedVendorIds = vendorsByItem.get(row.id as string) ?? [];
        const fallback = row.vendor_id ? [row.vendor_id as string] : [];
        const ids = linkedVendorIds.length ? linkedVendorIds : fallback;
        if (!ids.length) return null;
        const vendors = ids.map((id) => ({ id, name: vendorNames.get(id) ?? "—" }));
        return {
          id: row.id,
          name: row.name,
          vendor_id: ids[0],
          vendor_name: vendors.map((v) => v.name).join(", "),
          vendors,
        };
      })
      .filter(Boolean),
    patients: (patients ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      ipd_number: (p.ipd_number as string | null) ?? (p.uhid as string | null) ?? "",
    })),
    locations: locations ?? [],
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

  const requestedVendorId = body.vendor_id?.trim() || null;

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
    .select("id, name, vendor_id, track_inventory")
    .eq("id", itemId)
    .eq("is_active", true)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "invalid_item" }, { status: 400 });
  }

  const { data: vendorLinks } = await supabase.from("item_vendors").select("vendor_id").eq("item_id", itemId);
  const linkedVendorIds = [
    ...new Set(
      [
        ...(vendorLinks ?? []).map((l) => l.vendor_id as string),
        ...(item.vendor_id ? [item.vendor_id as string] : []),
      ].filter(Boolean),
    ),
  ];
  if (!linkedVendorIds.length) {
    return NextResponse.json({ error: "item_without_vendor" }, { status: 400 });
  }

  const vendorId =
    requestedVendorId ?? (linkedVendorIds.length === 1 ? linkedVendorIds[0] : null);
  if (!vendorId) {
    return NextResponse.json({ error: "missing_vendor_id" }, { status: 400 });
  }
  if (!linkedVendorIds.includes(vendorId)) {
    return NextResponse.json({ error: "invalid_vendor_for_item" }, { status: 400 });
  }

  const linenItem = await isLinenItem(supabase, itemId);
  const patientId = body.patient_id?.trim() || null;
  const locationId = body.location_id?.trim() || null;

  if (linenItem) {
    if (!patientId && !locationId) {
      return NextResponse.json({ error: "missing_patient_or_location" }, { status: 400 });
    }
    if (patientId) {
      const { data: patient } = await supabase
        .from("patients")
        .select("id")
        .eq("id", patientId)
        .eq("status", "active")
        .maybeSingle();
      if (!patient) return NextResponse.json({ error: "invalid_patient" }, { status: 400 });
    }
    if (locationId) {
      const { data: loc } = await supabase.from("locations").select("id").eq("id", locationId).eq("is_active", true).maybeSingle();
      if (!loc) return NextResponse.json({ error: "invalid_location" }, { status: 400 });
    }
  } else {
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
  }

  const { data, error } = await supabase
    .from("indents")
    .insert({
      vendor_id: vendorId,
      item_id: itemId,
      item_description: item.name,
      quantity: qty,
      priority,
      patient_id: patientId,
      location_id: locationId,
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
    if (!(await canViewVendor(actorId!, indent.vendor_id as string))) {
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
