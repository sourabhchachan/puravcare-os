import { NextResponse } from "next/server";

import { assertActiveUser, canCreateTasks, getActorId, getUserRole } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";
import { taskTypeForInsertFromTemplate } from "@/lib/task/taskTypes";

const RECURRENCE = ["one-time", "hourly", "2h", "4h", "6h", "8h", "daily", "weekly"] as const;

function attachAssigneeNames(
  tasks: Record<string, unknown>[],
  users: { id: string; full_name: string }[] | null,
) {
  const map = Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name]));
  return tasks.map((t) => ({
    ...t,
    assignee_name: map[t.assignee_id as string] ?? "—",
  }));
}

function resolveActorId(request: Request, bodyActor?: string): string | null {
  return getActorId(request) ?? bodyActor?.trim() ?? null;
}

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "all";
  const assigneeFilter = url.searchParams.get("assignee_id");
  const openOnly = url.searchParams.get("open_only") === "1";

  const role = await getUserRole(actorId);
  const isCeo = role === "ceo";
  const supabase = createServiceClient();

  let query = supabase.from("tasks").select("*").eq("is_active", true).order("created_at", { ascending: false });

  if (isCeo && assigneeFilter) {
    query = query.eq("assignee_id", assigneeFilter);
    if (openOnly) {
      query = query.in("status", ["pending", "acknowledged", "in_progress", "done", "blocked"]);
    }
  } else if (!isCeo) {
    query = query.eq("assignee_id", actorId!);
  } else if (filter === "my") {
    query = query.eq("assignee_id", actorId!);
  }

  if (filter === "blocked") {
    query = query.eq("status", "blocked");
  } else if (filter === "overdue") {
    const nowIso = new Date().toISOString();
    query = query
      .not("due_at", "is", null)
      .lt("due_at", nowIso)
      .in("status", ["pending", "acknowledged", "in_progress", "blocked"]);
  }

  const { data: tasks, error } = await query;
  if (error) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const rows = tasks ?? [];
  const assigneeIds = [...new Set(rows.map((t) => t.assignee_id as string).filter(Boolean))];
  let users: { id: string; full_name: string }[] | null = [];
  if (assigneeIds.length) {
    const res = await supabase.from("users").select("id, full_name").in("id", assigneeIds);
    users = res.data;
  }

  const canCreate = await canCreateTasks(actorId);

  return NextResponse.json({
    tasks: attachAssigneeNames(rows, users),
    can_create_tasks: canCreate,
  });
}

type PostBody = {
  actor_id?: string;
  task_master_id?: string;
  assignee_id?: string;
  due_at?: string | null;
  priority?: string;
  proof_type?: string;
  countersign_user_id?: string | null;
  recurrence?: string;
  patient_id?: string | null;
  psi_node_id?: string | null;
};

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = resolveActorId(request, body.actor_id);
  if (!actorId || !(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await canCreateTasks(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const taskMasterId = (body.task_master_id ?? "").trim();
  if (!taskMasterId) return NextResponse.json({ error: "missing_task_master" }, { status: 400 });

  if (!body.assignee_id) return NextResponse.json({ error: "missing_assignee" }, { status: 400 });

  const priority = body.priority;
  if (!priority || !["critical", "high", "normal", "low"].includes(priority)) {
    return NextResponse.json({ error: "invalid_priority" }, { status: 400 });
  }

  const proofType = body.proof_type;
  if (!proofType || !["tap", "photo", "countersign"].includes(proofType)) {
    return NextResponse.json({ error: "invalid_proof" }, { status: 400 });
  }

  const recurrence = body.recurrence;
  if (!recurrence || !RECURRENCE.includes(recurrence as (typeof RECURRENCE)[number])) {
    return NextResponse.json({ error: "invalid_recurrence" }, { status: 400 });
  }

  if (proofType === "countersign" && !body.countersign_user_id) {
    return NextResponse.json({ error: "missing_countersigner" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: master, error: mErr } = await supabase
    .from("task_master")
    .select("id, title, task_type, is_active")
    .eq("id", taskMasterId)
    .maybeSingle();

  if (mErr || !master || !master.is_active) {
    return NextResponse.json({ error: "invalid_task_master" }, { status: 400 });
  }

  const taskType = taskTypeForInsertFromTemplate(master.task_type as string);
  if (taskType === "clinical" && !body.patient_id) {
    return NextResponse.json({ error: "missing_patient" }, { status: 400 });
  }

  const { data: assignee } = await supabase
    .from("users")
    .select("id")
    .eq("id", body.assignee_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!assignee) return NextResponse.json({ error: "invalid_assignee" }, { status: 400 });

  if (body.psi_node_id) {
    const { data: psi } = await supabase
      .from("psi_nodes")
      .select("id")
      .eq("id", body.psi_node_id)
      .eq("status", "approved")
      .maybeSingle();
    if (!psi) return NextResponse.json({ error: "invalid_psi" }, { status: 400 });
  }

  if (body.patient_id) {
    const { data: pat } = await supabase.from("patients").select("id").eq("id", body.patient_id).maybeSingle();
    if (!pat) return NextResponse.json({ error: "invalid_patient" }, { status: 400 });
  }

  const title = (master.title as string).trim();
  const insertRow = {
    title,
    task_type: taskType,
    assignee_id: body.assignee_id,
    created_by: actorId,
    patient_id: taskType === "clinical" ? body.patient_id : null,
    psi_node_id: body.psi_node_id ?? null,
    task_master_id: taskMasterId,
    due_at: body.due_at || null,
    priority,
    proof_type: proofType,
    countersign_user_id: proofType === "countersign" ? body.countersign_user_id : null,
    recurrence,
    status: "pending",
    is_active: true,
  };

  const { data: task, error } = await supabase.from("tasks").insert(insertRow).select("*").single();
  if (error || !task) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await supabase.from("task_events").insert({
    task_id: task.id as string,
    actor_id: actorId,
    event_type: "created",
    old_value: null,
    new_value: "pending",
    note: null,
  });

  return NextResponse.json({ task });
}
