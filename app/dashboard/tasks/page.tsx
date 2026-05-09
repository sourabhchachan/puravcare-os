"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { priorityBorderClass, PriorityBadge, StatusBadge } from "@/components/tasks/TaskBadges";
import { useAuth } from "@/lib/hooks/useAuth";

type TaskRow = {
  id: string;
  title: string;
  assignee_name: string;
  due_at: string | null;
  priority: string;
  status: string;
};

const BASE_FILTERS = [
  { id: "all", label: "All" },
  { id: "my", label: "My Tasks" },
  { id: "overdue", label: "Overdue" },
  { id: "blocked", label: "Blocked" },
] as const;

type FilterId = (typeof BASE_FILTERS)[number]["id"] | "unlinked";

function formatDue(due: string | null) {
  if (!due) return "—";
  try {
    return new Date(due).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return due;
  }
}

export default function TasksListPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><p className="text-sm text-slate-500">Loading…</p></div>}>
      <TasksListInner />
    </Suspense>
  );
}

function TasksListInner() {
  const { session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<FilterId>("all");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filters = useMemo(() => {
    const list = [...BASE_FILTERS] as { id: FilterId; label: string }[];
    if (session?.role === "ceo") list.push({ id: "unlinked", label: "Unlinked PSI" });
    return list;
  }, [session?.role]);

  useEffect(() => {
    const f = searchParams.get("filter");
    if (f === "unlinked" && session?.role === "ceo") setFilter("unlinked");
  }, [searchParams, session?.role]);

  function setFilterAndUrl(next: FilterId) {
    setFilter(next);
    if (next === "unlinked" && session?.role === "ceo") {
      router.replace("/dashboard/tasks?filter=unlinked", { scroll: false });
    } else {
      router.replace("/dashboard/tasks", { scroll: false });
    }
  }

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks?filter=${filter}`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { tasks?: TaskRow[]; can_create_tasks?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load tasks");
        return;
      }
      setTasks(data.tasks ?? []);
      setCanCreate(Boolean(data.can_create_tasks));
    } catch {
      setError("Could not load tasks");
    } finally {
      setLoading(false);
    }
  }, [session, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Tasks</h1>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {canCreate ? (
            <Link
              href="/dashboard/tasks/new"
              className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white shadow-sm"
            >
              New Task
            </Link>
          ) : null}
          {session.role === "ceo" ? (
            <Link href="/dashboard/tasks/reassign" className="text-xs font-medium text-[#2563EB] underline">
              Bulk reassign
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterAndUrl(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              filter === f.id ? "bg-[#2563EB] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-slate-500">No tasks match this filter.</p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link
                href={`/dashboard/tasks/${t.id}`}
                className={`block rounded-xl border border-y border-r border-slate-200 border-l-4 ${priorityBorderClass(
                  t.priority,
                )} bg-white p-4 shadow-sm transition hover:shadow-md`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{t.title}</p>
                  <div className="flex flex-wrap gap-1">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  Assignee: <span className="font-medium text-slate-800">{t.assignee_name}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Due: {formatDue(t.due_at)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

