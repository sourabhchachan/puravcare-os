import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { canViewVendor } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = {
  action?: string;
  reason?: string | null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const action = body.action;
  if (!["dispatch", "deliver", "cancel"].includes(action ?? "")) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: row, error: fe } = await supabase.from("indents").select("*").eq("id", id).maybeSingle();
  if (fe || !row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const vendorId = row.vendor_id as string;
  const role = await getUserRole(actorId);
  const nowIso = new Date().toISOString();

  if (action === "cancel") {
    if (role === "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const isCreator = row.created_by === actorId;
    if (!(await assertCeoOrOps(actorId)) && !isCreator) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (row.status !== "pending") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    const reason = (body.reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "missing_reason" }, { status: 400 });

    const { data, error } = await supabase
      .from("indents")
      .update({
        status: "cancelled",
        cancel_reason: reason,
        cancelled_by: actorId!,
        cancelled_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ indent: data });
  }

  if (!(await canViewVendor(actorId!, vendorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (action === "dispatch") {
    if (row.status !== "pending") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    if (role === "vendor") {
      const { data: link } = await supabase.from("vendor_users").select("vendor_id").eq("user_id", actorId!).maybeSingle();
      if (!link || link.vendor_id !== vendorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    } else if (!(await assertCeoOrOps(actorId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("indents")
      .update({ status: "dispatched", updated_at: nowIso })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ indent: data });
  }

  /* deliver */
  if (!(await assertCeoOrOps(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (row.status !== "dispatched") return NextResponse.json({ error: "invalid_state" }, { status: 400 });

  const { data, error } = await supabase
    .from("indents")
    .update({ status: "delivered", updated_at: nowIso })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ indent: data });
}
