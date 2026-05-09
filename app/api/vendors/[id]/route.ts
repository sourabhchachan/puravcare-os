import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { canViewVendor } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await canViewVendor(actorId!, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: vendor, error } = await supabase.from("vendors").select("*").eq("id", id).maybeSingle();
  if (error || !vendor) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [{ data: indents }, { data: items }] = await Promise.all([
    supabase.from("indents").select("*").eq("vendor_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("items").select("id, name, price, is_active, created_at").eq("vendor_id", id).order("name"),
  ]);

  let userLogin: string | null = null;
  if (vendor.user_id) {
    const { data: u } = await supabase.from("users").select("login_id, full_name").eq("id", vendor.user_id).maybeSingle();
    userLogin = u ? `${(u as { full_name: string }).full_name} (${(u as { login_id: string }).login_id})` : null;
  }

  return NextResponse.json({
    vendor,
    indents: indents ?? [],
    items: items ?? [],
    linked_user_label: userLogin,
  });
}

type PatchBody = {
  name?: string;
  category?: string | null;
  phone?: string | null;
  user_id?: string | null;
  is_active?: boolean;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: existing } = await supabase.from("vendors").select("id").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const n = (body.name ?? "").trim();
    if (!n) return NextResponse.json({ error: "missing_name" }, { status: 400 });
    updates.name = n;
  }
  if (body.category !== undefined) updates.category = (body.category ?? "").trim() || null;
  if (body.phone !== undefined) updates.phone = (body.phone ?? "").trim() || null;
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
  if (body.user_id !== undefined) {
    const userId = body.user_id?.trim() || null;
    if (userId) {
      const { data: u } = await supabase.from("users").select("id, role").eq("id", userId).eq("is_active", true).maybeSingle();
      if (!u || u.role !== "vendor") return NextResponse.json({ error: "invalid_user_link" }, { status: 400 });
      const { data: taken } = await supabase.from("vendors").select("id").eq("user_id", userId).neq("id", id).maybeSingle();
      if (taken) return NextResponse.json({ error: "user_already_linked" }, { status: 400 });
    }
    updates.user_id = userId;
  }

  if (!Object.keys(updates).length) return NextResponse.json({ error: "no_updates" }, { status: 400 });

  const { data, error } = await supabase.from("vendors").update(updates).eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ vendor: data });
}
