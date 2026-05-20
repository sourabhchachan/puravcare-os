import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = {
  title?: string;
  task_type?: string;
  is_active?: boolean;
  psi_node_id?: string | null;
  visible_to_staff?: boolean;
  visible_to_vendor?: boolean;
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
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title.trim();
  if (typeof body.task_type === "string") {
    if (!["ops", "clinical"].includes(body.task_type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 });
    updates.task_type = body.task_type;
  }
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (typeof body.visible_to_staff === "boolean") updates.visible_to_staff = body.visible_to_staff;
  if (typeof body.visible_to_vendor === "boolean") updates.visible_to_vendor = body.visible_to_vendor;
  if (body.psi_node_id !== undefined) {
    const psiNodeId = body.psi_node_id?.trim() || null;
    if (psiNodeId) {
      const supabase = createServiceClient();
      const { data: psi } = await supabase
        .from("psi_nodes")
        .select("id")
        .eq("id", psiNodeId)
        .eq("status", "approved")
        .eq("type", "problem")
        .eq("is_active", true)
        .maybeSingle();
      if (!psi) return NextResponse.json({ error: "invalid_psi_node" }, { status: 400 });
    }
    updates.psi_node_id = psiNodeId;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("task_master").update(updates).eq("id", id).select("*").single();

  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: template } = await supabase.from("task_master").select("id").eq("id", id).maybeSingle();
  if (!template) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("task_master_id", id)
    .eq("is_active", true);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "template_in_use" }, { status: 400 });
  }

  const { error } = await supabase.from("task_master").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
