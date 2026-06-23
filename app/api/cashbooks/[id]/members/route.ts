import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  user_id?: string;
  role?: string;
  can_backdate?: "always" | "never" | "1day";
  can_edit_own?: boolean;
  hide_balance?: boolean;
  hide_others_entries?: boolean;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cashbookId } = await params;
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const isCeo = await assertCeo(actorId!);

  const { data: myMember } = await supabase
    .from("cashbook_members")
    .select("role")
    .eq("cashbook_id", cashbookId)
    .eq("user_id", actorId!)
    .maybeSingle();

  if (!isCeo && myMember?.role !== "primary_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const uid = (body.user_id ?? "").trim();
  if (!uid) return NextResponse.json({ error: "missing_user" }, { status: 400 });

  const role = body.role;
  if (!role || !["admin", "data_operator", "viewer"].includes(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  const { data: u } = await supabase.from("users").select("id").eq("id", uid).eq("is_active", true).maybeSingle();
  if (!u) return NextResponse.json({ error: "invalid_user" }, { status: 400 });

  const canBackdate =
    role === "data_operator" ? body.can_backdate ?? "never" : "never";
  if (!["always", "never", "1day"].includes(canBackdate)) {
    return NextResponse.json({ error: "invalid_can_backdate" }, { status: 400 });
  }

  const { error } = await supabase.from("cashbook_members").insert({
    cashbook_id: cashbookId,
    user_id: uid,
    role,
    can_backdate: canBackdate,
    can_edit_own: role === "data_operator" ? Boolean(body.can_edit_own) : role === "viewer" ? false : true,
    hide_balance: role === "data_operator" ? Boolean(body.hide_balance) : false,
    hide_others_entries: role === "data_operator" ? Boolean(body.hide_others_entries) : false,
  });

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "duplicate_member" }, { status: 409 });
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cashbookId } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("user_id")?.trim();
  if (!targetUserId) return NextResponse.json({ error: "missing_user_id" }, { status: 400 });

  const supabase = createServiceClient();
  const isCeo = await assertCeo(actorId!);

  const { data: myMember } = await supabase
    .from("cashbook_members")
    .select("role")
    .eq("cashbook_id", cashbookId)
    .eq("user_id", actorId!)
    .maybeSingle();

  if (!isCeo && myMember?.role !== "primary_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: target } = await supabase
    .from("cashbook_members")
    .select("role")
    .eq("cashbook_id", cashbookId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (target.role === "primary_admin") {
    return NextResponse.json({ error: "cannot_remove_primary_admin" }, { status: 400 });
  }

  const { error } = await supabase.from("cashbook_members").delete().eq("cashbook_id", cashbookId).eq("user_id", targetUserId);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
