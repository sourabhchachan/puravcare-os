"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { useAuth } from "@/lib/hooks/useAuth";

const RECURRENCE = ["one-time", "hourly", "2h", "4h", "6h", "8h", "daily", "weekly"] as const;
type PriorityLevel = "critical" | "high" | "normal" | "low";

type Template = {
  id: string;
  title: string;
  task_type: string;
  default_assignee_role: string | null;
  proof_type: string;
  recurrence: string;
  priority: string;
  is_patient_linked: boolean;
  is_active: boolean;
};

export default function TaskMasterPage() {
  const { session, loading: authLoading } = useAuth();
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
        return;
      }
      setTemplates(data.templates ?? []);
    } catch {
      setError("Could not load templates");
    } finally {
      setLoading(false);
    }
  }, [session]);

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
      if (!res.ok) return;
      await load();
    } catch {
      /* ignore */
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
          className="shrink-0 rounded-lg bg-[#1A3C5E] px-3 py-2 text-xs font-semibold text-white"
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
                <p className="text-xs text-slate-600">
                  {t.task_type} · {t.recurrence} · {t.priority}
                </p>
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
  const [title, setTitle] = useState(initial?.title ?? "");
  const [taskType, setTaskType] = useState<"patient" | "ops">((initial?.task_type as "patient" | "ops") ?? "ops");
  const [defaultRole, setDefaultRole] = useState<string>(initial?.default_assignee_role ?? "staff");
  const [proofType, setProofType] = useState<"tap" | "photo" | "countersign">(
    (initial?.proof_type as "tap" | "photo" | "countersign") ?? "tap",
  );
  const [recurrence, setRecurrence] = useState<(typeof RECURRENCE)[number]>(
    (initial?.recurrence as (typeof RECURRENCE)[number]) ?? "one-time",
  );
  const [priority, setPriority] = useState<PriorityLevel>((initial?.priority as PriorityLevel) ?? "normal");
  const [patientLinked, setPatientLinked] = useState(initial?.is_patient_linked ?? false);
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = {
        title,
        task_type: taskType,
        default_assignee_role: defaultRole || null,
        proof_type: proofType,
        recurrence,
        priority,
        is_patient_linked: patientLinked,
        is_active: active,
      };

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
        return;
      }
      onSaved();
    } catch {
      setError("Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#1A3C5E]">{initial ? "Edit template" : "New template"}</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Task type</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as typeof taskType)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ops">Ops</option>
              <option value="patient">Patient</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Default assignee role</label>
            <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="ceo">CEO</option>
              <option value="ops">Ops</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Proof type</label>
            <select value={proofType} onChange={(e) => setProofType(e.target.value as typeof proofType)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="tap">Tap</option>
              <option value="photo">Photo</option>
              <option value="countersign">Countersign</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Recurrence</label>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as typeof recurrence)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {RECURRENCE.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as PriorityLevel)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span>Patient linked</span>
            <input type="checkbox" checked={patientLinked} onChange={(e) => setPatientLinked(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span>Active</span>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" disabled={saving || !title.trim()} className="w-full rounded-lg bg-[#1A3C5E] py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
