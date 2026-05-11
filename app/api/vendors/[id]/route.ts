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

  const { data: links } = await supabase.from("vendor_users").select("user_id").eq("vendor_id", id);
  const userIds = [...new Set((links ?? []).map((l) => l.user_id as string).filter(Boolean))];
  let linkedUsers: { id: string; full_name: string; login_id: string }[] = [];
  if (userIds.length) {
    const { data: users } = await supabase.from("users").select("id, full_name, login_id").in("id", userIds).order("full_name");
    linkedUsers = (users ?? []) as { id: string; full_name: string; login_id: string }[];
  }

  return NextResponse.json({
    vendor,
    indents: indents ?? [],
    items: items ?? [],
    linked_users: linkedUsers,
  });
}

type PatchBody = {
  name?: string;
  category?: string | null;
  phone?: string | null;
  add_user_id?: string;
  remove_user_id?: string;
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

  const addUserId = body.add_user_id?.trim();
  const removeUserId = body.remove_user_id?.trim();
  if (addUserId && removeUserId) return NextResponse.json({ error: "invalid_action" }, { status: 400 });

  if (addUserId) {
    const { data: u } = await supabase.from("users").select("id, role").eq("id", addUserId).eq("is_active", true).maybeSingle();
    if (!u || u.role !== "vendor") return NextResponse.json({ error: "invalid_user_link" }, { status: 400 });
    const { data: taken } = await supabase.from("vendor_users").select("id, vendor_id").eq("user_id", addUserId).maybeSingle();
    if (taken && taken.vendor_id !== id) return NextResponse.json({ error: "user_already_linked" }, { status: 400 });
    if (!taken) {
      const { error: linkError } = await supabase.from("vendor_users").insert({ vendor_id: id, user_id: addUserId });
      if (linkError) return NextResponse.json({ error: "link_failed" }, { status: 500 });
    }
  }
  if (removeUserId) {
    const { error: unlinkError } = await supabase.from("vendor_users").delete().eq("vendor_id", id).eq("user_id", removeUserId);
    if (unlinkError) return NextResponse.json({ error: "unlink_failed" }, { status: 500 });
  }

  if (!Object.keys(updates).length && !addUserId && !removeUserId) return NextResponse.json({ error: "no_updates" }, { status: 400 });

  let data = null;
  if (Object.keys(updates).length) {
    const res = await supabase.from("vendors").update(updates).eq("id", id).select("*").single();
    if (res.error || !res.data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    data = res.data;
  } else {
    const res = await supabase.from("vendors").select("*").eq("id", id).maybeSingle();
    if (res.error || !res.data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    data = res.data;
  }
  return NextResponse.json({ vendor: data });
}
