import { NextResponse } from "next/server";

import { assertActiveUser, canCreateItems, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

async function assertItemMasterAccess(actorId: string | null) {
  if (!actorId) return false;
  if (await assertCeo(actorId)) return true;
  return canCreateItems(actorId);
}

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertItemMasterAccess(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const [{ data: items, error: itemsError }, { data: vendors }] = await Promise.all([
    supabase.from("items").select("id, name, price, vendor_id, is_patient_linked, is_active, created_at").order("name"),
    supabase.from("vendors").select("id, name").eq("is_active", true).order("name"),
  ]);

  if (itemsError) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const vendorMap = Object.fromEntries((vendors ?? []).map((v) => [v.id, v.name]));
  const rows = (items ?? []).map((row) => ({
    ...row,
    vendor_name: row.vendor_id ? (vendorMap[row.vendor_id as string] as string) ?? "—" : null,
  }));

  return NextResponse.json({ items: rows, vendors: vendors ?? [] });
}

type PostBody = {
  name?: string;
  price?: number;
  vendor_id?: string | null;
  is_patient_linked?: boolean;
  is_active?: boolean;
};

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertItemMasterAccess(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  const price = body.price;
  if (price === undefined || price === null || Number.isNaN(Number(price))) {
    return NextResponse.json({ error: "invalid_price" }, { status: 400 });
  }

  const vendorId = body.vendor_id?.trim() || null;
  if (!vendorId) return NextResponse.json({ error: "missing_vendor" }, { status: 400 });

  const supabase = createServiceClient();

  {
    const { data: v } = await supabase.from("vendors").select("id").eq("id", vendorId).maybeSingle();
    if (!v) return NextResponse.json({ error: "invalid_vendor" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("items")
    .insert({
      name,
      price: Number(price),
      vendor_id: vendorId,
      is_patient_linked: Boolean(body.is_patient_linked),
      is_active: body.is_active !== false,
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
