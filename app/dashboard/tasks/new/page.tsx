"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/ToastProvider";
import { IdCombobox } from "@/components/ui/IdCombobox";
import { useAuth } from "@/lib/hooks/useAuth";
import { normalizeTemplateTaskType } from "@/lib/task/taskTypes";

type UserOpt = { id: string; full_name: string; role: string };
type PatientOpt = { id: string; full_name: string; uhid: string; ipd_number?: string | null };
type PsiOpt = { id: string; title: string; type: string };
type TemplateOpt = { id: string; title: string; task_type: "ops" | "clinical"; psi_node_id: string | null };

const RECURRENCE = ["one-time", "hourly", "2h", "4h", "6h", "8h", "daily", "weekly", "monthly", "yearly"] as const;

type CreateTaskErrorBody = {
  error?: string;
  detail?: string;
  supabase_error?: { message: string; code?: string; details?: string; hint?: string };
};

function userVisibleCreateError(body: CreateTaskErrorBody): string {
  if (body.supabase_error) {
    const se = body.supabase_error;
    return [se.message, se.code && `Code: ${se.code}`, se.hint && `Hint: ${se.hint}`, se.details && `Details: ${se.details}`]
      .filter(Boolean)
      .join("\n");
  }
  if (body.detail) return body.detail;
  return body.error ?? "Could not create task";
}

export default function NewTaskPage() {
  const router = useRouter();
  const { session } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [psiNodes, setPsiNodes] = useState<PsiOpt[]>([]);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [taskMasterId, setTaskMasterId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueLocal, setDueLocal] = useState("");
  const [priority, setPriority] = useState<"critical" | "high" | "normal" | "low">("normal");
  const [proofType, setProofType] = useState<"tap" | "photo" | "countersign">("tap");
  const [countersignUserId, setCountersignUserId] = useState("");
  const [recurrence, setRecurrence] = useState<(typeof RECURRENCE)[number]>("one-time");
  const [patientId, setPatientId] = useState("");
  const [psiNodeId, setPsiNodeId] = useState("");

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === taskMasterId) ?? null,
    [templates, taskMasterId],
  );

  const templateOptions = useMemo(
    () =>
      templates.map((t) => ({
        id: t.id,
        label: `${t.title} (${t.task_type === "clinical" ? "Clinical" : "Ops"})`,
      })),
    [templates],
  );

  const assigneeOptions = useMemo(
    () => users.map((u) => ({ id: u.id, label: `${u.full_name} (${u.role})` })),
    [users],
  );

  const isClinical = selectedTemplate?.task_type === "clinical";

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      try {
        const res = await fetch("/api/task-meta", { headers: { "x-actor-id": session.id } });
        const data = (await res.json()) as {
          users?: UserOpt[];
          patients?: PatientOpt[];
          psi_nodes?: PsiOpt[];
          task_templates?: { id: string; title: string; task_type: string; psi_node_id: string | null }[];
          can_create_tasks?: boolean;
        };
        if (!res.ok || cancelled) return;
        if (!data.can_create_tasks) {
          setAllowed(false);
          return;
        }
        setAllowed(true);
        setUsers(data.users ?? []);
        setPatients(data.patients ?? []);
        setPsiNodes(data.psi_nodes ?? []);
        setTemplates(
          (data.task_templates ?? []).map((t) => ({
            ...t,
            task_type: normalizeTemplateTaskType(t.task_type),
          })),
        );
      } catch {
        setError("Could not load form.");
        toast.error("Could not load form");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, toast]);

  useEffect(() => {
    setPsiNodeId(selectedTemplate?.psi_node_id ?? "");
  }, [selectedTemplate?.id, selectedTemplate?.psi_node_id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError("");
    setSaving(true);
    try {
      let due_at: string | null = null;
      if (dueLocal) {
        due_at = new Date(dueLocal).toISOString();
      }
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": session.id },
        body: JSON.stringify({
          actor_id: session.id,
          task_master_id: taskMasterId,
          assignee_id: assigneeId,
          due_at,
          priority,
          proof_type: proofType,
          countersign_user_id: proofType === "countersign" ? countersignUserId : null,
          recurrence,
          patient_id: isClinical ? patientId : null,
          psi_node_id: psiNodeId || null,
        }),
      });
      const body = (await res.json()) as CreateTaskErrorBody & { task?: { id: string } };
      if (!res.ok) {
        const msg = userVisibleCreateError(body);
        setError(msg);
        const toastMsg = body.detail ?? body.supabase_error?.message ?? body.error ?? "Could not create task";
        toast.error(toastMsg);
        return;
      }
      toast.success("Task created");
      router.replace(`/dashboard/tasks/${body.task?.id ?? ""}`);
    } catch {
      setError("Could not create task");
      toast.error("Could not create task");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  if (loadingMeta) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (!allowed) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700 shadow-sm">
        You do not have permission to create tasks.
        <div className="mt-3">
          <Link href="/dashboard/tasks" className="font-medium text-[#2563EB] underline">
            Back to tasks
          </Link>
        </div>
      </div>
    );
  }

  const disableSubmit =
    saving ||
    !taskMasterId ||
    !assigneeId ||
    (isClinical && !patientId) ||
    (proofType === "countersign" && !countersignUserId);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">New task</h1>
        <Link href="/dashboard/tasks" className="text-xs font-medium text-[#2563EB] underline">
          Cancel
        </Link>
      </div>

      <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
        <div>
          <IdCombobox
            id="new-task-template"
            label="Task template"
            value={taskMasterId}
            onChange={setTaskMasterId}
            options={templateOptions}
            placeholder="Type to filter templates…"
          />
        </div>

        {isClinical ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Patient (active IPD)</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            >
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.ipd_number ?? p.uhid)} · {p.full_name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <IdCombobox
            id="new-task-assignee"
            label="Assignee"
            value={assigneeId}
            onChange={setAssigneeId}
            options={assigneeOptions}
            placeholder="Type to filter users…"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Due date & time</label>
          <input
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Proof type</label>
          <select
            value={proofType}
            onChange={(e) => setProofType(e.target.value as typeof proofType)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          >
            <option value="tap">Tap</option>
            <option value="photo">Photo</option>
            <option value="countersign">Countersign</option>
          </select>
        </div>

        {proofType === "countersign" ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Countersign user</label>
            <select
              value={countersignUserId}
              onChange={(e) => setCountersignUserId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            >
              <option value="">Select user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Recurrence</label>
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as (typeof RECURRENCE)[number])}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          >
            {RECURRENCE.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">PSI link (optional)</label>
          <select
            value={psiNodeId}
            onChange={(e) => setPsiNodeId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          >
            <option value="">None</option>
            {psiNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Error from server</p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-snug">{error}</pre>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={disableSubmit}
          className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create task"}
        </button>
      </form>
    </div>
  );
}
