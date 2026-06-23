import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertLinenStoreVendor } from "@/lib/linen/access";
import { createLinenFollowup } from "@/lib/linen/followups";
import { getLinenStatusQty } from "@/lib/linen/stockLevels";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  item_id?: string;
  quantity?: number;
  patient_id?: string | null;
  location_id?: string | null;
};

type PatchBody = {
  return_id?: string;
  action?: string;
  good_quantity?: number;
  damaged_quantity?: number;
};

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
  const patientId = (body.patient_id ?? "").trim() || null;
  const locationId = (body.location_id ?? "").trim() || null;
  const quantity = Number(body.quantity);

  if (!itemId) return NextResponse.json({ error: "missing_item_id" }, { status: 400 });
  if (!patientId && !locationId) return NextResponse.json({ error: "missing_destination" }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: item } = await supabase.from("items").select("id, track_inventory").eq("id", itemId).maybeSingle();
  if (!item?.track_inventory) return NextResponse.json({ error: "invalid_item" }, { status: 400 });

  if (patientId) {
    const { data: patient } = await supabase.from("patients").select("id").eq("id", patientId).maybeSingle();
    if (!patient) return NextResponse.json({ error: "invalid_patient" }, { status: 400 });
  }
  if (locationId) {
    const { data: loc } = await supabase.from("locations").select("id").eq("id", locationId).eq("is_active", true).maybeSingle();
    if (!loc) return NextResponse.json({ error: "invalid_location" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from("linen_returns")
    .insert({
      item_id: itemId,
      quantity,
      patient_id: patientId,
      location_id: locationId,
      status: "pending",
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (error || !row) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ return: row });
}

export async function PATCH(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const vendor = await assertLinenStoreVendor(actorId!);
  if (!vendor) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (body.action !== "receive_return") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const returnId = (body.return_id ?? "").trim();
  if (!returnId) return NextResponse.json({ error: "missing_return_id" }, { status: 400 });

  const goodQty = Number(body.good_quantity ?? 0);
  const damagedQty = Number(body.damaged_quantity ?? 0);
  if (!Number.isFinite(goodQty) || goodQty < 0 || !Number.isFinite(damagedQty) || damagedQty < 0) {
    return NextResponse.json({ error: "invalid_quantities" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: ret } = await supabase.from("linen_returns").select("*").eq("id", returnId).maybeSingle();
  if (!ret) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ret.status !== "pending") return NextResponse.json({ error: "invalid_state" }, { status: 400 });

  const originalQty = Number(ret.quantity);
  const shortage = originalQty - goodQty - damagedQty;
  if (shortage < 0) return NextResponse.json({ error: "quantities_exceed_original" }, { status: 400 });

  const itemId = ret.item_id as string;
  const inUse = await getLinenStatusQty(supabase, itemId, "in_use");
  const totalMove = goodQty + damagedQty + Math.max(shortage, 0);
  if (totalMove > inUse + 0.001) {
    return NextResponse.json({ error: "insufficient_in_use_stock" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const base = {
    item_id: itemId,
    patient_id: ret.patient_id,
    location_id: ret.location_id,
    linen_return_id: returnId,
    created_by: actorId!,
  };

  if (goodQty > 0) {
    const { error } = await supabase.from("linen_transactions").insert({
      ...base,
      transaction_type: "return_good",
      quantity: goodQty,
      from_status: "in_use",
      to_status: "in_laundry_bag",
    });
    if (error) return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
  }

  if (damagedQty > 0) {
    const { error } = await supabase.from("linen_transactions").insert({
      ...base,
      transaction_type: "return_damaged",
      quantity: damagedQty,
      from_status: "in_use",
      to_status: "damaged",
    });
    if (error) return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
  }

  if (shortage > 0) {
    const { error } = await supabase.from("linen_transactions").insert({
      ...base,
      transaction_type: "return_lost",
      quantity: shortage,
      from_status: "in_use",
      to_status: "lost",
    });
    if (error) return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
    try {
      await createLinenFollowup(supabase, {
        item_id: itemId,
        quantity: shortage,
        source_type: "return",
        source_id: returnId,
        created_by: actorId!,
      });
    } catch {
      return NextResponse.json({ error: "followup_failed" }, { status: 500 });
    }
  }

  const { error: updErr } = await supabase
    .from("linen_returns")
    .update({
      status: "received",
      good_quantity: goodQty,
      damaged_quantity: damagedQty,
      received_by: actorId!,
      received_at: nowIso,
    })
    .eq("id", returnId);

  if (updErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, shortage });
}
