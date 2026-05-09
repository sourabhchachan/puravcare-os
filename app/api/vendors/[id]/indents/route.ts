import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { canViewVendor } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: vendorId } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await canViewVendor(actorId!, vendorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const statusFilter = (url.searchParams.get("status") ?? "").trim();

  const supabase = createServiceClient();
  let q = supabase.from("indents").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false });
  if (["pending", "dispatched", "delivered", "cancelled"].includes(statusFilter)) {
    q = q.eq("status", statusFilter);
  }

  const { data: indents, error } = await q;
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  return NextResponse.json({ indents: indents ?? [] });
}

type PostBody = {
  item_description?: string;
  quantity?: number | null;
  unit?: string | null;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: vendorId } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeoOrOps(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await canViewVendor(actorId!, vendorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const itemDescription = (body.item_description ?? "").trim();
  if (!itemDescription) return NextResponse.json({ error: "missing_description" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: v } = await supabase.from("vendors").select("id").eq("id", vendorId).maybeSingle();
  if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const qty = body.quantity != null && !Number.isNaN(Number(body.quantity)) ? Number(body.quantity) : null;

  const { data, error } = await supabase
    .from("indents")
    .insert({
      vendor_id: vendorId,
      item_description: itemDescription,
      quantity: qty,
      unit: (body.unit ?? "").trim() || null,
      status: "pending",
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ indent: data });
}
