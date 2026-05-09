"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { downloadExcelResponse } from "@/lib/dashboard/downloadExcel";

import { priorityBorderClass, PriorityBadge, StatusBadge } from "@/components/tasks/TaskBadges";
import { useToast } from "@/components/ui/ToastProvider";
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
  const toast = useToast();

  const [task, setTask] = useState<TaskRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [assigneeName, setAssigneeName] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [countersignName, setCountersignName] = useState<string | null>(null);
  const [patient, setPatient] = useState<{ full_name: string; uhid: string } | null>(null);
  const [psi, setPsi] = useState<{ title: string } | null>(null);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [photoUrl, setPhotoUrl] = useState("");
  const [blockNote, setBlockNote] = useState("");
  const [blockSheetOpen, setBlockSheetOpen] = useState(false);
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [unblockSheetOpen, setUnblockSheetOpen] = useState(false);
  const [unblockNote, setUnblockNote] = useState("");
  const [chainInfo, setChainInfo] = useState<{ id: string; title: string } | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [newAssignee, setNewAssignee] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [activityExportOpen, setActivityExportOpen] = useState(false);

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
        psi?: { title: string } | null;
        chain?: { id: string; title: string } | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load task");
        toast.error(data.error ?? "Could not load task");
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
      setChainInfo(data.chain ?? null);

      const meta = await fetch("/api/task-meta", { headers: { "x-actor-id": session.id } });
      const metaJson = (await meta.json()) as { users?: { id: string; full_name: string }[] };
      if (meta.ok) setUsers(metaJson.users ?? []);
    } catch {
      setError("Could not load task");
      toast.error("Could not load task");
    } finally {
      setLoading(false);
    }
  }, [session, id, toast]);

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
        toast.error(body.error ?? "Action failed");
        return false;
      }
      const okLabels: Record<string, string> = {
        acknowledge: "Acknowledged",
        mark_done: "Saved",
        upload_proof: "Proof saved",
        confirm: "Task completed",
        countersign: "Task completed",
        reassign: "Task reassigned",
        mark_blocked: "Marked as blocked",
        cancel: "Task cancelled",
        unblock: "Task unblocked",
      };
      toast.success(okLabels[action] ?? "Saved");
      await load();
      return true;
    } catch {
      setError("Action failed");
      toast.error("Action failed");
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
  const isCeoOrOps = session.role === "ceo" || session.role === "ops";
  const isCounter = task.countersign_user_id === session.id;
  const inChain = Boolean(chainInfo);
  const canReassign = isCeo || (isCreator && !inChain);

  const showAck = isAssignee && task.status === "pending";
  const showMarkDoneTapOrCounter =
    isAssignee && task.status === "acknowledged" && (task.proof_type === "tap" || task.proof_type === "countersign");
  const showPhotoUpload = isAssignee && task.status === "acknowledged" && task.proof_type === "photo";
  const showConfirm = (isCreator || isCeo) && task.status === "done" && task.proof_type === "photo";
  const showCounterSign = isCounter && task.proof_type === "countersign" && task.status === "done";
  const showBlock =
    isAssignee && ["pending", "acknowledged", "in_progress"].includes(task.status as string);
  const showUnblock = isCeoOrOps && task.status === "blocked";
  const showCancel =
    (isCeo || isCreator) && (task.status === "pending" || task.status === "acknowledged");

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
          <h1
            className={`text-lg font-semibold ${
              task.status === "cancelled" ? "text-slate-500 line-through" : "text-slate-900"
            }`}
          >
            {task.title as string}
          </h1>
          <div className="flex flex-wrap gap-1">
            <PriorityBadge priority={task.priority as string} />
            <StatusBadge status={task.status as string} />
          </div>
        </div>

        {chainInfo ? (
          <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            Part of chain: <span className="font-semibold">{chainInfo.title}</span>
          </p>
        ) : null}

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
              <dd className="font-medium">{psi.title}</dd>
            </div>
          ) : null}
          {task.reassign_reason ? (
            <div className="flex flex-col gap-1">
              <dt className="text-slate-500">Last reassign reason</dt>
              <dd className="font-medium text-slate-800">{task.reassign_reason as string}</dd>
            </div>
          ) : null}
          {(task as { block_reason?: string | null }).block_reason ? (
            <div className="flex flex-col gap-1">
              <dt className="text-slate-500">Block reason</dt>
              <dd className="font-medium text-amber-900">{(task as { block_reason?: string }).block_reason}</dd>
            </div>
          ) : null}
          {(task as { cancel_reason?: string | null }).cancel_reason ? (
            <div className="flex flex-col gap-1">
              <dt className="text-slate-500">Cancel reason</dt>
              <dd className="font-medium text-slate-700">{(task as { cancel_reason?: string }).cancel_reason}</dd>
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
          <button
            type="button"
            disabled={busy}
            onClick={() => setBlockSheetOpen(true)}
            className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Block task
          </button>
        ) : null}

        {showUnblock ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setUnblockSheetOpen(true)}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Unblock task
          </button>
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

      {showCancel ? (
        <div className="rounded-xl border border-red-100 bg-white p-4 shadow-sm">
          <button
            type="button"
            disabled={busy}
            onClick={() => setCancelSheetOpen(true)}
            className="w-full rounded-lg bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Cancel task
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
          <button
            type="button"
            onClick={() => setActivityExportOpen(true)}
            className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-[#2563EB]"
          >
            Export Excel
          </button>
        </div>
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

      {activityExportOpen && session ? (
        <TaskActivityExportSheet
          taskId={id}
          sessionId={session.id}
          onClose={() => setActivityExportOpen(false)}
          onDone={async () => {
            toast.success("Export downloaded");
          }}
        />
      ) : null}

      {blockSheetOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
          <button type="button" className="flex-1" aria-label="Close" onClick={() => setBlockSheetOpen(false)} />
          <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <h2 className="text-lg font-semibold text-amber-700">Block task</h2>
            <p className="mt-1 text-xs text-slate-600">Reason is required. CEO and the task creator will be notified.</p>
            <label className="mt-3 block text-xs font-medium text-slate-600">Reason</label>
            <textarea
              value={blockNote}
              onChange={(e) => setBlockNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-amber-500 focus:ring-2"
              rows={3}
            />
            <button
              type="button"
              disabled={busy || !blockNote.trim()}
              onClick={async () => {
                const ok = await patch("mark_blocked", { note: blockNote.trim() });
                if (ok) {
                  setBlockSheetOpen(false);
                  setBlockNote("");
                }
              }}
              className="mt-4 w-full rounded-lg bg-amber-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirm block
            </button>
          </div>
        </div>
      ) : null}

      {cancelSheetOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
          <button type="button" className="flex-1" aria-label="Close" onClick={() => setCancelSheetOpen(false)} />
          <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <h2 className="text-lg font-semibold text-red-700">Cancel task</h2>
            <p className="mt-1 text-xs text-slate-600">This cannot be undone. A reason is required.</p>
            <label className="mt-3 block text-xs font-medium text-slate-600">Reason</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-red-500 focus:ring-2"
              rows={3}
            />
            <button
              type="button"
              disabled={busy || !cancelReason.trim()}
              onClick={async () => {
                const ok = await patch("cancel", { reason: cancelReason.trim() });
                if (ok) {
                  setCancelSheetOpen(false);
                  setCancelReason("");
                }
              }}
              className="mt-4 w-full rounded-lg bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirm cancel
            </button>
          </div>
        </div>
      ) : null}

      {unblockSheetOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
          <button type="button" className="flex-1" aria-label="Close" onClick={() => setUnblockSheetOpen(false)} />
          <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <h2 className="text-lg font-semibold text-emerald-800">Unblock task</h2>
            <p className="mt-1 text-xs text-slate-600">The task will return to in progress. A note is required.</p>
            <label className="mt-3 block text-xs font-medium text-slate-600">Note</label>
            <textarea
              value={unblockNote}
              onChange={(e) => setUnblockNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-emerald-600 focus:ring-2"
              rows={3}
            />
            <button
              type="button"
              disabled={busy || !unblockNote.trim()}
              onClick={async () => {
                const ok = await patch("unblock", { note: unblockNote.trim() });
                if (ok) {
                  setUnblockSheetOpen(false);
                  setUnblockNote("");
                }
              }}
              className="mt-4 w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirm unblock
            </button>
          </div>
        </div>
      ) : null}

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

function ymdTask(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function TaskActivityExportSheet({
  taskId,
  sessionId,
  onClose,
  onDone,
}: {
  taskId: string;
  sessionId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [from, setFrom] = useState(ymdTask(new Date()));
  const [to, setTo] = useState(ymdTask(new Date()));

  async function download(preset: "this_month" | "last_month" | "this_year" | "custom", customFrom?: string, customTo?: string) {
    const params = new URLSearchParams({ preset });
    if (preset === "custom" && customFrom && customTo) {
      params.set("start", new Date(customFrom + "T00:00:00").toISOString());
      params.set("end", new Date(customTo + "T23:59:59").toISOString());
    }
    const res = await fetch(`/api/tasks/${taskId}/events/export?${params}`, { headers: { "x-actor-id": sessionId } });
    if (!res.ok) {
      toast.error("Export failed");
      return;
    }
    await downloadExcelResponse(res, "task-activity.xlsx");
    onDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Export activity</h2>
        <div className="mt-3 flex flex-col gap-2">
          <button type="button" className="rounded-lg border border-slate-200 py-2 text-sm" onClick={() => void download("this_month")}>
            This month
          </button>
          <button type="button" className="rounded-lg border border-slate-200 py-2 text-sm" onClick={() => void download("last_month")}>
            Last month
          </button>
          <button type="button" className="rounded-lg border border-slate-200 py-2 text-sm" onClick={() => void download("this_year")}>
            This year
          </button>
        </div>
        <p className="mt-4 text-xs font-semibold text-slate-600">Custom range</p>
        <div className="mt-2 flex gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm" />
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded-lg bg-[#2563EB] py-2 text-sm font-semibold text-white"
          onClick={() => void download("custom", from, to)}
        >
          Download custom
        </button>
      </div>
    </div>
  );
}
