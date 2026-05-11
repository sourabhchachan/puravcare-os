import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { getVendorForUser } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  item_id?: string;
  quantity?: number | null;
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

  const [{ data: indents, error: indentsError }, { data: items, error: itemsError }] = await Promise.all([
    query,
    supabase.from("items").select("id, name, vendor_id").eq("is_active", true).not("vendor_id", "is", null).order("name"),
  ]);

  if (indentsError || itemsError) {
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

  return NextResponse.json({
    indents: (indents ?? []).map((row) => ({
      ...row,
      vendor_name: vendorNames.get(row.vendor_id as string) ?? "—",
    })),
    items: (items ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      vendor_id: row.vendor_id,
      vendor_name: vendorNames.get(row.vendor_id as string) ?? "—",
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

  const { data, error } = await supabase
    .from("indents")
    .insert({
      vendor_id: item.vendor_id,
      item_description: item.name,
      quantity: qty,
      status: "pending",
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
  return NextResponse.json({ indent: data });
}
