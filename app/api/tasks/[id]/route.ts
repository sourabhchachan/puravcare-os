import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type TaskRow = {
  id: string;
  title: string;
  task_type: string;
  assignee_id: string;
  created_by: string;
  patient_id: string | null;
  psi_node_id: string | null;
  due_at: string | null;
  priority: string;
  proof_type: string;
  countersign_user_id: string | null;
  recurrence: string;
  status: string;
  proof_photo_url: string | null;
  reassign_reason: string | null;
  is_active: boolean;
};

async function insertEvent(
  supabase: ReturnType<typeof createServiceClient>,
  row: {
    task_id: string;
    actor_id: string;
    event_type: string;
    old_value: string | null;
    new_value: string | null;
    note?: string | null;
  },
) {
  await supabase.from("task_events").insert({
    task_id: row.task_id,
    actor_id: row.actor_id,
    event_type: row.event_type,
    old_value: row.old_value,
    new_value: row.new_value,
    note: row.note ?? null,
  });
}

function canViewTask(task: TaskRow, actorId: string, role: string | null) {
  if (role === "ceo") return true;
  return (
    task.assignee_id === actorId ||
    task.created_by === actorId ||
    (task.countersign_user_id && task.countersign_user_id === actorId)
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: task, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (error || !task) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserRole(actorId);
  if (!canViewTask(task as TaskRow, actorId!, role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: events } = await supabase
    .from("task_events")
    .select("*")
    .eq("task_id", id)
    .order("created_at", { ascending: false });

  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id as string))];
  let actorNames: Record<string, string> = {};
  if (actorIds.length) {
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", actorIds);
    actorNames = Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name]));
  }

  const userIds = [task.assignee_id, task.created_by, task.countersign_user_id].filter(Boolean) as string[];

  const { data: relatedUsers } = await supabase.from("users").select("id, full_name, role").in("id", userIds);
  const userMap = Object.fromEntries((relatedUsers ?? []).map((u) => [u.id, u]));

  let patient: { id: string; full_name: string; uhid: string } | null = null;
  if (task.patient_id) {
    const { data: p } = await supabase.from("patients").select("id, full_name, uhid").eq("id", task.patient_id).maybeSingle();
    patient = p;
  }

  let psi: { id: string; title: string; type: string } | null = null;
  if (task.psi_node_id) {
    const { data: s } = await supabase.from("psi_nodes").select("id, title, type").eq("id", task.psi_node_id).maybeSingle();
    psi = s;
  }

  const eventsWithActors = (events ?? []).map((e) => ({
    ...e,
    actor_name: actorNames[e.actor_id as string] ?? "—",
  }));

  return NextResponse.json({
    task,
    events: eventsWithActors,
    assignee_name: userMap[task.assignee_id]?.full_name ?? "—",
    creator_name: userMap[task.created_by]?.full_name ?? "—",
    countersign_name: task.countersign_user_id ? userMap[task.countersign_user_id]?.full_name ?? null : null,
    patient,
    psi,
  });
}

type PatchBody = {
  actor_id?: string;
  action?: string;
  proof_photo_url?: string;
  note?: string;
  new_assignee_id?: string;
  reason?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = body.actor_id?.trim();
  if (!actorId || !(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: task, error: fetchErr } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (fetchErr || !task) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserRole(actorId);
  const t = task as TaskRow;
  if (!canViewTask(t, actorId, role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const action = body.action;
  if (!action) return NextResponse.json({ error: "missing_action" }, { status: 400 });

  const nowIso = new Date().toISOString();

  switch (action) {
    case "acknowledge": {
      if (t.assignee_id !== actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (t.status !== "pending") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      await supabase.from("tasks").update({ status: "acknowledged", updated_at: nowIso }).eq("id", id);
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "acknowledged",
        old_value: "pending",
        new_value: "acknowledged",
        note: null,
      });
      break;
    }
    case "mark_done": {
      if (t.assignee_id !== actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (t.status !== "acknowledged") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      if (t.proof_type === "tap") {
        await supabase.from("tasks").update({ status: "closed", updated_at: nowIso }).eq("id", id);
        await insertEvent(supabase, {
          task_id: id,
          actor_id: actorId,
          event_type: "status_changed",
          old_value: "acknowledged",
          new_value: "closed",
          note: null,
        });
        await insertEvent(supabase, {
          task_id: id,
          actor_id: actorId,
          event_type: "confirmed",
          old_value: "acknowledged",
          new_value: "closed",
          note: "tap",
        });
      } else if (t.proof_type === "countersign") {
        await supabase.from("tasks").update({ status: "done", updated_at: nowIso }).eq("id", id);
        await insertEvent(supabase, {
          task_id: id,
          actor_id: actorId,
          event_type: "status_changed",
          old_value: "acknowledged",
          new_value: "done",
          note: null,
        });
      } else {
        return NextResponse.json({ error: "use_upload_proof" }, { status: 400 });
      }
      break;
    }
    case "upload_proof": {
      if (t.assignee_id !== actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (t.proof_type !== "photo") return NextResponse.json({ error: "invalid_proof" }, { status: 400 });
      if (t.status !== "acknowledged") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      const url = (body.proof_photo_url ?? "").trim();
      if (!url) return NextResponse.json({ error: "missing_url" }, { status: 400 });
      await supabase
        .from("tasks")
        .update({ status: "done", proof_photo_url: url, updated_at: nowIso })
        .eq("id", id);
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "proof_uploaded",
        old_value: t.proof_photo_url,
        new_value: url,
        note: null,
      });
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "status_changed",
        old_value: "acknowledged",
        new_value: "done",
        note: null,
      });
      break;
    }
    case "confirm": {
      const isRequester = t.created_by === actorId;
      const isCeo = role === "ceo";
      if (!isRequester && !isCeo) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (t.status !== "done") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      await supabase.from("tasks").update({ status: "closed", updated_at: nowIso }).eq("id", id);
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "confirmed",
        old_value: "done",
        new_value: "closed",
        note: null,
      });
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "status_changed",
        old_value: "done",
        new_value: "closed",
        note: "confirmed",
      });
      break;
    }
    case "countersign": {
      if (t.countersign_user_id !== actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (t.proof_type !== "countersign") return NextResponse.json({ error: "invalid_proof" }, { status: 400 });
      if (t.status !== "done") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      await supabase.from("tasks").update({ status: "closed", updated_at: nowIso }).eq("id", id);
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "countersigned",
        old_value: "done",
        new_value: "closed",
        note: null,
      });
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "status_changed",
        old_value: "done",
        new_value: "closed",
        note: null,
      });
      break;
    }
    case "reassign": {
      const ceoOk = await assertCeo(actorId);
      const creatorOk = t.created_by === actorId;
      if (!ceoOk && !creatorOk) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const newAssignee = body.new_assignee_id?.trim();
      const reason = (body.reason ?? "").trim();
      if (!newAssignee || !reason) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
      const { data: nu } = await supabase.from("users").select("id").eq("id", newAssignee).eq("is_active", true).maybeSingle();
      if (!nu) return NextResponse.json({ error: "invalid_assignee" }, { status: 400 });
      const prevAssignee = t.assignee_id;
      await supabase
        .from("tasks")
        .update({
          assignee_id: newAssignee,
          reassign_reason: reason,
          status: "pending",
          updated_at: nowIso,
        })
        .eq("id", id);
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "reassigned",
        old_value: prevAssignee,
        new_value: newAssignee,
        note: reason,
      });
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "status_changed",
        old_value: t.status,
        new_value: "pending",
        note: "reassign",
      });
      break;
    }
    case "mark_blocked": {
      if (t.assignee_id !== actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (!["pending", "acknowledged", "in_progress"].includes(t.status)) {
        return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      }
      await supabase.from("tasks").update({ status: "blocked", updated_at: nowIso }).eq("id", id);
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "blocked",
        old_value: t.status,
        new_value: "blocked",
        note: body.note?.trim() || null,
      });
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "status_changed",
        old_value: t.status,
        new_value: "blocked",
        note: body.note?.trim() || null,
      });
      break;
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  const { data: updated } = await supabase.from("tasks").select("*").eq("id", id).single();
  return NextResponse.json({ task: updated });
}
