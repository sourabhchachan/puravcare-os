import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import {
  isChainTaskProgressBlocked,
  maybeActivateVerticalChainOnAcknowledge,
  pauseChainsForBlockedTask,
  processAllChainsAfterTaskClosed,
  processChainAfterTaskCancelled,
  resumeChainsForUnblockedTask,
} from "@/lib/chains/onTaskClose";
import { notifyNewTaskAssigned, notifyTaskBlockedCeoAndCreator, notifyTaskCompletedRequester } from "@/lib/notifications/taskNotify";
import { createServiceClient } from "@/lib/supabase/service";
import { canViewTask as userCanViewTask } from "@/lib/tasks/canViewTask";

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
  if (!userCanViewTask(task as TaskRow, actorId!, role)) {
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

  let chain: { id: string; title: string } | null = null;
  const { data: chainStep } = await supabase
    .from("task_chain_steps")
    .select("chain_id")
    .eq("task_id", id)
    .maybeSingle();
  if (chainStep?.chain_id) {
    const { data: ch } = await supabase.from("task_chains").select("id, title").eq("id", chainStep.chain_id).maybeSingle();
    if (ch) chain = { id: ch.id as string, title: ch.title as string };
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
    chain,
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
  if (!userCanViewTask(t, actorId, role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const action = body.action;
  if (!action) return NextResponse.json({ error: "missing_action" }, { status: 400 });

  const nowIso = new Date().toISOString();

  switch (action) {
    case "acknowledge": {
      if (t.assignee_id !== actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (t.status !== "pending") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      if (await isChainTaskProgressBlocked(supabase, id)) {
        return NextResponse.json({ error: "chain_step_locked" }, { status: 403 });
      }
      await supabase.from("tasks").update({ status: "acknowledged", updated_at: nowIso }).eq("id", id);
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "acknowledged",
        old_value: "pending",
        new_value: "acknowledged",
        note: null,
      });
      await maybeActivateVerticalChainOnAcknowledge(supabase, id);
      break;
    }
    case "mark_done": {
      if (t.assignee_id !== actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (t.status !== "acknowledged") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      if (await isChainTaskProgressBlocked(supabase, id)) {
        return NextResponse.json({ error: "chain_step_locked" }, { status: 403 });
      }
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
        await processAllChainsAfterTaskClosed(supabase, id);
        await notifyTaskCompletedRequester(supabase, t.created_by, actorId, t.title, id);
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
      if (await isChainTaskProgressBlocked(supabase, id)) {
        return NextResponse.json({ error: "chain_step_locked" }, { status: 403 });
      }
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
      await processAllChainsAfterTaskClosed(supabase, id);
      await notifyTaskCompletedRequester(supabase, t.created_by, actorId, t.title, id);
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
      await processAllChainsAfterTaskClosed(supabase, id);
      await notifyTaskCompletedRequester(supabase, t.created_by, actorId, t.title, id);
      break;
    }
    case "reassign": {
      const { data: inChain } = await supabase.from("task_chain_steps").select("id").eq("task_id", id).maybeSingle();
      const ceoOk = await assertCeo(actorId);
      const creatorOk = t.created_by === actorId;
      if (inChain) {
        if (!ceoOk) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      } else if (!ceoOk && !creatorOk) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
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
      if (newAssignee !== prevAssignee) {
        await notifyNewTaskAssigned(supabase, newAssignee, t.title, id);
      }
      break;
    }
    case "mark_blocked": {
      if (t.assignee_id !== actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (!["pending", "acknowledged", "in_progress"].includes(t.status)) {
        return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      }
      const blockNote = (body.note ?? "").trim();
      if (!blockNote) return NextResponse.json({ error: "missing_note" }, { status: 400 });
      await supabase
        .from("tasks")
        .update({ status: "blocked", block_reason: blockNote, blocked_at: nowIso, updated_at: nowIso })
        .eq("id", id);
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "blocked",
        old_value: t.status,
        new_value: "blocked",
        note: blockNote,
      });
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "status_changed",
        old_value: t.status,
        new_value: "blocked",
        note: blockNote,
      });
      await pauseChainsForBlockedTask(supabase, id, t.title);
      await notifyTaskBlockedCeoAndCreator(supabase, actorId, t.created_by, t.title, id);
      break;
    }
    case "unblock": {
      if (!(await assertCeoOrOps(actorId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (t.status !== "blocked") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      const unblockNote = (body.note ?? "").trim();
      if (!unblockNote) return NextResponse.json({ error: "missing_note" }, { status: 400 });
      await supabase
        .from("tasks")
        .update({
          status: "in_progress",
          block_reason: null,
          blocked_at: null,
          updated_at: nowIso,
        })
        .eq("id", id);
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "unblocked",
        old_value: "blocked",
        new_value: "in_progress",
        note: unblockNote,
      });
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "status_changed",
        old_value: "blocked",
        new_value: "in_progress",
        note: unblockNote,
      });
      await resumeChainsForUnblockedTask(supabase, id);
      break;
    }
    case "cancel": {
      const ceoOk = await assertCeo(actorId);
      const creatorOk = t.created_by === actorId;
      if (!ceoOk && !creatorOk) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (!["pending", "acknowledged"].includes(t.status)) {
        return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      }
      const cancelReason = (body.reason ?? "").trim();
      if (!cancelReason) return NextResponse.json({ error: "missing_reason" }, { status: 400 });
      const { data: cancelledTask, error: cancelUpdateErr } = await supabase
        .from("tasks")
        .update({
          status: "cancelled",
          cancel_reason: cancelReason,
          cancelled_by: actorId,
          cancelled_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (cancelUpdateErr || !cancelledTask || (cancelledTask.status as string) !== "cancelled") {
        console.error("[tasks/cancel] update failed", cancelUpdateErr, cancelledTask?.status);
        return NextResponse.json({ error: "update_failed" }, { status: 500 });
      }
      await insertEvent(supabase, {
        task_id: id,
        actor_id: actorId,
        event_type: "cancelled",
        old_value: t.status,
        new_value: "cancelled",
        note: cancelReason,
      });
      await processChainAfterTaskCancelled(supabase, id, cancelReason);

      const { data: taskAfterChain } = await supabase.from("tasks").select("*").eq("id", id).single();
      const finalTask = taskAfterChain ?? cancelledTask;
      if ((finalTask.status as string) !== "cancelled") {
        console.error("[tasks/cancel] status reverted after chain processing", finalTask.status);
        return NextResponse.json({ error: "update_failed" }, { status: 500 });
      }
      return NextResponse.json({ task: finalTask });
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  const { data: updated } = await supabase.from("tasks").select("*").eq("id", id).single();
  return NextResponse.json({ task: updated });
}
