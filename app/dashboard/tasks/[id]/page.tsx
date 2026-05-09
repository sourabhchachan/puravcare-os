"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { priorityBorderClass, PriorityBadge, StatusBadge } from "@/components/tasks/TaskBadges";
import { useAuth } from "@/lib/hooks/useAuth";

type TaskRow = Record<string, unknown> & {
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
};

type EventRow = {
  id: string;
  event_type: string;
  actor_id: string;
  actor_name?: string;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
};

function formatDt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function TaskDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { session } = useAuth();

  const [task, setTask] = useState<TaskRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [assigneeName, setAssigneeName] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [countersignName, setCountersignName] = useState<string | null>(null);
  const [patient, setPatient] = useState<{ full_name: string; uhid: string } | null>(null);
  const [psi, setPsi] = useState<{ title: string; type: string } | null>(null);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [photoUrl, setPhotoUrl] = useState("");
  const [blockNote, setBlockNote] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [newAssignee, setNewAssignee] = useState("");
  const [reassignReason, setReassignReason] = useState("");

  const load = useCallback(async () => {
    if (!session || !id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${id}`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as {
        task?: TaskRow;
        events?: EventRow[];
        assignee_name?: string;
        creator_name?: string;
        countersign_name?: string | null;
        patient?: { full_name: string; uhid: string } | null;
        psi?: { title: string; type: string } | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load task");
        setTask(null);
        return;
      }
      setTask(data.task ?? null);
      setEvents(data.events ?? []);
      setAssigneeName(data.assignee_name ?? "");
      setCreatorName(data.creator_name ?? "");
      setCountersignName(data.countersign_name ?? null);
      setPatient(data.patient ?? null);
      setPsi(data.psi ?? null);

      const meta = await fetch("/api/task-meta", { headers: { "x-actor-id": session.id } });
      const metaJson = (await meta.json()) as { users?: { id: string; full_name: string }[] };
      if (meta.ok) setUsers(metaJson.users ?? []);
    } catch {
      setError("Could not load task");
    } finally {
      setLoading(false);
    }
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(action: string, extra?: Record<string, string>): Promise<boolean> {
    if (!session) return false;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor_id: session.id, action, ...extra }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Action failed");
        return false;
      }
      await load();
      return true;
    } catch {
      setError("Action failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!session) return null;
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!task) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">
        {error || "Task not found"}
        <div className="mt-3">
          <Link href="/dashboard/tasks" className="font-medium text-[#2563EB] underline">
            Back
          </Link>
        </div>
      </div>
    );
  }

  const isAssignee = task.assignee_id === session.id;
  const isCreator = task.created_by === session.id;
  const isCeo = session.role === "ceo";
  const isCounter = task.countersign_user_id === session.id;
  const canReassign = isCeo || isCreator;

  const showAck = isAssignee && task.status === "pending";
  const showMarkDoneTapOrCounter =
    isAssignee && task.status === "acknowledged" && (task.proof_type === "tap" || task.proof_type === "countersign");
  const showPhotoUpload = isAssignee && task.status === "acknowledged" && task.proof_type === "photo";
  const showConfirm = (isCreator || isCeo) && task.status === "done" && task.proof_type === "photo";
  const showCounterSign = isCounter && task.proof_type === "countersign" && task.status === "done";
  const showBlock =
    isAssignee && ["pending", "acknowledged", "in_progress"].includes(task.status as string);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <Link href="/dashboard/tasks" className="text-xs font-medium text-[#2563EB] underline">
          ← Tasks
        </Link>
      </div>

      <div
        className={`rounded-xl border border-y border-r border-slate-200 border-l-4 ${priorityBorderClass(
          task.priority as string,
        )} bg-white p-4 shadow-sm`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-lg font-semibold text-slate-900">{task.title as string}</h1>
          <div className="flex flex-wrap gap-1">
            <PriorityBadge priority={task.priority as string} />
            <StatusBadge status={task.status as string} />
          </div>
        </div>

        <dl className="mt-4 space-y-2 text-sm text-slate-700">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Type</dt>
            <dd className="font-medium capitalize">
              {task.task_type === "clinical" || task.task_type === "patient" ? "Clinical" : "Ops"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Assignee</dt>
            <dd className="font-medium">{assigneeName}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Created by</dt>
            <dd className="font-medium">{creatorName}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Due</dt>
            <dd className="font-medium">{formatDt(task.due_at as string | null)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Recurrence</dt>
            <dd className="font-medium">{task.recurrence as string}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Proof</dt>
            <dd className="font-medium capitalize">{task.proof_type as string}</dd>
          </div>
          {task.proof_type === "countersign" && countersignName ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Countersigner</dt>
              <dd className="font-medium">{countersignName}</dd>
            </div>
          ) : null}
          {patient ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Patient</dt>
              <dd className="font-medium">
                {patient.full_name} ({patient.uhid})
              </dd>
            </div>
          ) : null}
          {psi ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">PSI</dt>
              <dd className="font-medium">
                {psi.title} ({psi.type})
              </dd>
            </div>
          ) : null}
          {task.reassign_reason ? (
            <div className="flex flex-col gap-1">
              <dt className="text-slate-500">Last reassign reason</dt>
              <dd className="font-medium text-slate-800">{task.reassign_reason as string}</dd>
            </div>
          ) : null}
          {task.proof_photo_url ? (
            <div className="flex flex-col gap-1">
              <dt className="text-slate-500">Proof photo</dt>
              <dd>
                <a
                  href={task.proof_photo_url as string}
                  className="break-all text-[#2563EB] underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {String(task.proof_photo_url)}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {showAck ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void patch("acknowledge")}
            className="w-full rounded-lg bg-[#2563EB] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Acknowledge
          </button>
        ) : null}

        {showMarkDoneTapOrCounter ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void patch("mark_done")}
            className="w-full rounded-lg bg-[#2563EB] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Mark done
          </button>
        ) : null}

        {showPhotoUpload ? (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600">Proof photo URL</label>
            <input
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              placeholder="https://…"
            />
            <button
              type="button"
              disabled={busy || !photoUrl.trim()}
              onClick={() => void patch("upload_proof", { proof_photo_url: photoUrl.trim() })}
              className="w-full rounded-lg bg-[#2563EB] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Upload proof & mark done
            </button>
          </div>
        ) : null}

        {showConfirm ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void patch("confirm")}
            className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirm & close
          </button>
        ) : null}

        {showCounterSign ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void patch("countersign")}
            className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Counter-sign
          </button>
        ) : null}

        {showBlock ? (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <label className="block text-xs font-medium text-slate-600">Block note (optional)</label>
            <textarea
              value={blockNote}
              onChange={(e) => setBlockNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              rows={2}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch("mark_blocked", { note: blockNote.trim() })}
              className="w-full rounded-lg border border-red-300 bg-red-50 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-50"
            >
              Mark blocked
            </button>
          </div>
        ) : null}

        {canReassign ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setReassignOpen(true)}
            className="w-full rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
          >
            Reassign
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
        <ul className="mt-3 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <p className="text-xs text-slate-500">{formatDt(e.created_at)}</p>
              <p className="text-sm font-medium text-slate-800">
                {e.actor_name ?? "—"} · <span className="capitalize">{e.event_type.replace(/_/g, " ")}</span>
              </p>
              {(e.old_value || e.new_value) && (
                <p className="text-xs text-slate-600">
                  {e.old_value ?? "—"} → {e.new_value ?? "—"}
                </p>
              )}
              {e.note ? <p className="text-xs text-slate-600">{e.note}</p> : null}
            </li>
          ))}
          {events.length === 0 ? <p className="text-sm text-slate-500">No events yet.</p> : null}
        </ul>
      </div>

      {reassignOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
          <button type="button" className="flex-1" aria-label="Close" onClick={() => setReassignOpen(false)} />
          <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
            <h3 className="text-lg font-semibold text-[#2563EB]">Reassign task</h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">New assignee</label>
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Reason (required)</label>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  rows={3}
                  required
                />
              </div>
              <button
                type="button"
                disabled={busy || !newAssignee || !reassignReason.trim()}
                onClick={async () => {
                  const ok = await patch("reassign", {
                    new_assignee_id: newAssignee,
                    reason: reassignReason.trim(),
                  });
                  if (ok) {
                    setReassignOpen(false);
                    setReassignReason("");
                    setNewAssignee("");
                  }
                }}
                className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save reassign
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
