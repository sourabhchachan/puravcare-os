import { NextResponse } from "next/server";

import { assertActiveUser, canCreateTasks, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeTemplateTaskType } from "@/lib/task/taskTypes";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const privileged = await assertCeoOrOps(actorId);

  if (privileged) {
    const { data, error } = await supabase.from("task_master").select("*").order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    return NextResponse.json({ templates: data ?? [] });
  }

  if (!(await canCreateTasks(actorId!))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const role = await getUserRole(actorId);
  let q = supabase.from("task_master").select("id, title, task_type, is_active, psi_node_id").eq("is_active", true);
  if (role === "vendor") {
    q = q.eq("visible_to_vendor", true);
  } else {
    q = q.eq("visible_to_staff", true);
  }
  const { data, error } = await q.order("title");

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  const templates = (data ?? []).map((row) => ({
    ...row,
    task_type: normalizeTemplateTaskType(row.task_type as string),
  }));
  return NextResponse.json({ templates });
}

type PostBody = {
  title?: string;
  task_type?: string;
  is_active?: boolean;
  psi_node_id?: string | null;
  visible_to_staff?: boolean;
  visible_to_vendor?: boolean;
};

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });

  const taskType = body.task_type;
  if (!taskType || !["ops", "clinical"].includes(taskType)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }
  const psiNodeId = body.psi_node_id?.trim() || null;
  const supabase = createServiceClient();
  if (psiNodeId) {
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

  const visibleToStaff = body.visible_to_staff !== false;
  const visibleToVendor = body.visible_to_vendor === true;

  const { data, error } = await supabase
    .from("task_master")
    .insert({
      title,
      task_type: taskType,
      is_active: body.is_active !== false,
      psi_node_id: psiNodeId,
      visible_to_staff: visibleToStaff,
      visible_to_vendor: visibleToVendor,
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ template: data });
}
