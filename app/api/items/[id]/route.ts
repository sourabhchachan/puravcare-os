import { NextResponse } from "next/server";

import { assertActiveUser, canCreateItems, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

async function assertItemMasterAccess(actorId: string | null) {
  if (!actorId) return false;
  if (await assertCeo(actorId)) return true;
  return canCreateItems(actorId);
}

type PatchBody = {
  name?: string;
  price?: number;
  vendor_id?: string | null;
  is_patient_linked?: boolean;
  is_active?: boolean;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertItemMasterAccess(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (body.price !== undefined && body.price !== null) {
    const n = Number(body.price);
    if (Number.isNaN(n)) return NextResponse.json({ error: "invalid_price" }, { status: 400 });
    updates.price = n;
  }
  if ("vendor_id" in body) {
    const vendorId = body.vendor_id?.trim() || null;
    if (!vendorId) return NextResponse.json({ error: "missing_vendor" }, { status: 400 });
    updates.vendor_id = vendorId;
  }
  if (typeof body.is_patient_linked === "boolean") updates.is_patient_linked = body.is_patient_linked;
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (updates.vendor_id) {
    const { data: v } = await supabase.from("vendors").select("id").eq("id", updates.vendor_id as string).maybeSingle();
    if (!v) return NextResponse.json({ error: "invalid_vendor" }, { status: 400 });
  }

  if (typeof updates.name === "string") {
    const { data: others } = await supabase.from("items").select("id, name").neq("id", id);
    const taken = (others ?? []).some((r) => r.name && r.name.toLowerCase() === (updates.name as string).toLowerCase());
    if (taken) return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
  }

  const { data, error } = await supabase.from("items").update(updates).eq("id", id).select("*").single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
