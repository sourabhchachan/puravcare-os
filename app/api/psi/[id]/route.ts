import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = {
  action?: string;
  title?: string;
  description?: string | null;
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
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const action = body.action;
  if (!["approve", "reject", "deactivate", "reactivate", "edit"].includes(action ?? "")) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: row, error: fetchErr } = await supabase.from("psi_nodes").select("id, status, is_active").eq("id", id).maybeSingle();
  if (fetchErr || !row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (action === "edit") {
    const title = (body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });
    const { data, error } = await supabase
      .from("psi_nodes")
      .update({
        title,
        description: (body.description ?? "").trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ node: data });
  }
  if (action === "approve" || action === "reject") {
    if (row.status !== "proposed") {
      return NextResponse.json({ error: "not_proposed" }, { status: 400 });
    }
  }

  let updates: Record<string, unknown>;
  if (action === "approve") {
    updates = { status: "approved", approved_by: actorId!, is_active: true };
  } else if (action === "reject") {
    updates = { status: "rejected" };
  } else if (action === "deactivate") {
    if (row.status !== "approved") return NextResponse.json({ error: "not_approved" }, { status: 400 });
    updates = { is_active: false };
  } else {
    if (row.status !== "approved") return NextResponse.json({ error: "not_approved" }, { status: 400 });
    updates = { is_active: true };
  }

  const { data, error } = await supabase.from("psi_nodes").update(updates).eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ node: data });
}
