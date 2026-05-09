import { NextResponse } from "next/server";

import { assertActiveUser, canCreateTasks, getActorId, getUserRole } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";
import { OPEN_ASSIGNMENT_STATUSES } from "@/lib/tasks/activeTaskFilters";
import { insertTaskFromMaster, type SupabaseInsertErrorInfo } from "@/lib/tasks/insertTaskFromMaster";

function formatSupabaseErrorForClient(e: SupabaseInsertErrorInfo) {
  const parts = [e.message];
  if (e.code) parts.push(`code=${e.code}`);
  if (e.hint) parts.push(`hint: ${e.hint}`);
  if (e.details) parts.push(`details: ${e.details}`);
  return parts.join(" | ");
}

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

async function enrichTasksWithChainMeta(
  supabase: ReturnType<typeof createServiceClient>,
  tasks: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const ids = tasks.map((t) => t.id as string).filter(Boolean);
  if (!ids.length) return tasks;
  const { data: steps } = await supabase
    .from("task_chain_steps")
    .select("task_id, chain_id, task_chains(title)")
    .in("task_id", ids);
  const chainByTask: Record<string, { chain_title: string; chain_id: string }> = {};
  for (const s of steps ?? []) {
    const tid = s.task_id as string;
    const rel = s.task_chains as { title: string } | { title: string }[] | null;
    const title = Array.isArray(rel) ? rel[0]?.title : rel?.title;
    if (tid && title) chainByTask[tid] = { chain_title: title, chain_id: s.chain_id as string };
  }
  return tasks.map((t) => {
    const id = t.id as string;
    const c = chainByTask[id];
    return {
      ...t,
      chain_title: c?.chain_title ?? null,
      chain_id: c?.chain_id ?? null,
    } as Record<string, unknown>;
  });
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
  const countOnly = url.searchParams.get("count_only") === "1";

  const role = await getUserRole(actorId);
  const isCeo = role === "ceo";
  const supabase = createServiceClient();

  if (countOnly && filter === "unlinked") {
    let countQuery = supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .is("psi_node_id", null)
      .in("status", OPEN_ASSIGNMENT_STATUSES);
    if (!isCeo) {
      countQuery = countQuery.eq("assignee_id", actorId!);
    }
    const { count, error: countError } = await countQuery;
    if (countError) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    return NextResponse.json({ count: count ?? 0 });
  }

  let query = supabase.from("tasks").select("*").eq("is_active", true).order("created_at", { ascending: false });

  if (isCeo && assigneeFilter) {
    query = query.eq("assignee_id", assigneeFilter);
    if (openOnly) {
      query = query.in("status", [...OPEN_ASSIGNMENT_STATUSES, "done"]);
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
  } else if (filter === "unlinked") {
    query = query.is("psi_node_id", null).in("status", OPEN_ASSIGNMENT_STATUSES);
  }

  const { data: tasks, error } = await query;
  if (error) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const rows = await enrichTasksWithChainMeta(supabase, tasks ?? []);
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

  const supabase = createServiceClient();
  const ins = await insertTaskFromMaster(supabase, {
    actorId,
    taskMasterId,
    assigneeId: body.assignee_id,
    dueAt: body.due_at ?? null,
    patientId: body.patient_id ?? null,
    psiNodeId: body.psi_node_id ?? null,
    fromChain: false,
    initialStatus: "pending",
    priority: body.priority,
    proofType: body.proof_type,
    recurrence: body.recurrence,
    countersignUserId: body.countersign_user_id,
  });

  if (ins.error) {
    const map: Record<string, number> = {
      invalid_priority: 400,
      invalid_proof: 400,
      invalid_recurrence: 400,
      missing_countersigner: 400,
      invalid_task_master: 400,
      missing_patient: 400,
      invalid_assignee: 400,
      invalid_psi: 400,
      invalid_patient: 400,
      insert_failed: 500,
    };
    const status = map[ins.error] ?? 400;
    if (ins.error === "insert_failed" && ins.supabaseError) {
      console.error("[POST /api/tasks] insert_failed", ins.supabaseError);
      return NextResponse.json(
        {
          error: ins.error,
          supabase_error: ins.supabaseError,
          /** Human-readable single line for toasts; full object above for debugging */
          detail: formatSupabaseErrorForClient(ins.supabaseError),
        },
        { status },
      );
    }
    return NextResponse.json({ error: ins.error }, { status });
  }

  return NextResponse.json({ task: ins.task });
}
