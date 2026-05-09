"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";
import { normalizeTemplateTaskType } from "@/lib/task/taskTypes";

type Template = {
  id: string;
  title: string;
  task_type: string;
  is_active: boolean;
};

function typeLabel(t: string) {
  return normalizeTemplateTaskType(t) === "clinical" ? "Clinical" : "Ops";
}

export default function TaskMasterPage() {
  const { session, loading: authLoading } = useAuth();
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<Template | "new" | null>(null);

  const load = useCallback(async () => {
    if (!session || session.role !== "ceo") return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/task-master", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { templates?: Template[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load templates");
        toast.error(data.error ?? "Could not load templates");
        return;
      }
      setTemplates((data.templates ?? []) as Template[]);
    } catch {
      setError("Could not load templates");
      toast.error("Could not load templates");
    } finally {
      setLoading(false);
    }
  }, [session, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(t: Template, next: boolean) {
    if (!session) return;
    try {
      const res = await fetch(`/api/task-master/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": session.id },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) {
        toast.error("Could not update template");
        return;
      }
      toast.success(next ? "Template activated" : "Template deactivated");
      await load();
    } catch {
      toast.error("Could not update template");
    }
  }

  if (authLoading || !session) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (session.role !== "ceo") {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center text-red-700 shadow-sm">
        Access denied
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Task master</h1>
          <p className="text-sm text-slate-500">Reusable task templates</p>
        </div>
        <button
          type="button"
          onClick={() => setSheet("new")}
          className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
        >
          New Template
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <button type="button" className="text-left" onClick={() => setSheet(t)}>
                <p className="font-semibold text-slate-900">{t.title}</p>
                <p className="text-xs text-slate-600">{typeLabel(t.task_type)}</p>
              </button>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <span>Active</span>
                <input
                  type="checkbox"
                  checked={t.is_active}
                  onChange={(e) => void toggleActive(t, e.target.checked)}
                />
              </label>
            </li>
          ))}
          {templates.length === 0 ? <p className="text-sm text-slate-500">No templates yet.</p> : null}
        </ul>
      )}

      {sheet ? (
        <TemplateSheet
          sessionId={session.id}
          initial={sheet === "new" ? null : sheet}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            toast.success("Template saved");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateSheet({
  sessionId,
  initial,
  onClose,
  onSaved,
}: {
  sessionId: string;
  initial: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [taskType, setTaskType] = useState<"ops" | "clinical">(
    initial ? normalizeTemplateTaskType(initial.task_type) : "ops",
  );
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = { title, task_type: taskType, is_active: active };
      const isNew = !initial;
      const res = isNew
        ? await fetch("/api/task-master", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/task-master/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
            body: JSON.stringify(body),
          });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        toast.error(data.error ?? "Could not save");
        return;
      }
      onSaved();
    } catch {
      setError("Could not save");
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">{initial ? "Edit template" : "New template"}</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as "ops" | "clinical")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ops">Ops</option>
              <option value="clinical">Clinical</option>
            </select>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span>Active</span>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
