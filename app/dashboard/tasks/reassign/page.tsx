"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { priorityBorderClass, PriorityBadge, StatusBadge } from "@/components/tasks/TaskBadges";
import { useAuth } from "@/lib/hooks/useAuth";

type UserOpt = { id: string; full_name: string; role: string };
type TaskRow = {
  id: string;
  title: string;
  assignee_name: string;
  due_at: string | null;
  priority: string;
  status: string;
};

function formatDue(due: string | null) {
  if (!due) return "—";
  try {
    return new Date(due).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return due;
  }
}

export default function BulkReassignPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [newAssignee, setNewAssignee] = useState("");
  const [reason, setReason] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session || session.role !== "ceo") return;
    let cancelled = false;
    (async () => {
      setLoadingUsers(true);
      try {
        const res = await fetch("/api/task-meta", { headers: { "x-actor-id": session.id } });
        const data = (await res.json()) as { users?: UserOpt[] };
        if (!cancelled && res.ok) setUsers(data.users ?? []);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const loadTasks = useCallback(async () => {
    if (!session || !assigneeId) return;
    setLoadingTasks(true);
    setError("");
    setSelected({});
    try {
      const res = await fetch(
        `/api/tasks?assignee_id=${encodeURIComponent(assigneeId)}&open_only=1`,
        { headers: { "x-actor-id": session.id } },
      );
      const data = (await res.json()) as { tasks?: TaskRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load tasks");
        setTasks([]);
        return;
      }
      setTasks(data.tasks ?? []);
    } catch {
      setError("Could not load tasks");
    } finally {
      setLoadingTasks(false);
    }
  }, [session, assigneeId]);

  useEffect(() => {
    if (assigneeId) void loadTasks();
    else setTasks([]);
  }, [assigneeId, loadTasks]);

  if (!session) return null;

  if (session.role !== "ceo") {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700 shadow-sm">
        Access denied — CEO only.
        <div className="mt-3">
          <Link href="/dashboard/tasks" className="font-medium text-[#1A3C5E] underline">
            Back to tasks
          </Link>
        </div>
      </div>
    );
  }

  const allIds = tasks.map((t) => t.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected[id]);

  function toggleAll() {
    if (allSelected) {
      setSelected({});
    } else {
      const next: Record<string, boolean> = {};
      allIds.forEach((id) => {
        next[id] = true;
      });
      setSelected(next);
    }
  }

  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => k);

  async function handleBulk() {
    if (!session) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/bulk-reassign-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_id: session.id,
          task_ids: selectedIds,
          new_assignee_id: newAssignee,
          reason: reason.trim(),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Bulk reassign failed");
        return;
      }
      setReason("");
      setNewAssignee("");
      setSelected({});
      await loadTasks();
    } catch {
      setError("Bulk reassign failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Bulk reassign</h1>
        <Link href="/dashboard/tasks" className="text-xs font-medium text-[#1A3C5E] underline">
          Back
        </Link>
      </div>

      {loadingUsers ? (
        <p className="text-sm text-slate-500">Loading users…</p>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Filter by assignee</label>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
          >
            <option value="">Select user</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role})
              </option>
            ))}
          </select>
        </div>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {assigneeId ? (
        loadingTasks ? (
          <p className="text-sm text-slate-500">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No open tasks for this user.</p>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                Select all ({tasks.length})
              </label>
            </div>

            <ul className="space-y-2">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className={`flex gap-3 rounded-xl border border-y border-r border-slate-200 border-l-4 ${priorityBorderClass(
                    t.priority,
                  )} bg-white p-3 shadow-sm`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selected[t.id])}
                    onChange={(e) => setSelected((s) => ({ ...s, [t.id]: e.target.checked }))}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{t.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <PriorityBadge priority={t.priority} />
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Due {formatDue(t.due_at)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Reassign selected ({selectedIds.length})</h2>
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
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  rows={3}
                />
              </div>
              <button
                type="button"
                disabled={saving || selectedIds.length === 0 || !newAssignee || !reason.trim()}
                onClick={() => void handleBulk()}
                className="w-full rounded-lg bg-[#1A3C5E] py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Reassign selected"}
              </button>
            </div>
          </>
        )
      ) : null}
    </div>
  );
}
