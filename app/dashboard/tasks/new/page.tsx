"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/hooks/useAuth";

type UserOpt = { id: string; full_name: string; role: string };
type PatientOpt = { id: string; full_name: string; uhid: string };
type PsiOpt = { id: string; title: string; type: string };

const RECURRENCE = ["one-time", "hourly", "2h", "4h", "6h", "8h", "daily", "weekly"] as const;

export default function NewTaskPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [psiNodes, setPsiNodes] = useState<PsiOpt[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<"patient" | "ops">("ops");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueLocal, setDueLocal] = useState("");
  const [priority, setPriority] = useState<"critical" | "high" | "normal" | "low">("normal");
  const [proofType, setProofType] = useState<"tap" | "photo" | "countersign">("tap");
  const [countersignUserId, setCountersignUserId] = useState("");
  const [recurrence, setRecurrence] = useState<(typeof RECURRENCE)[number]>("one-time");
  const [patientId, setPatientId] = useState("");
  const [psiNodeId, setPsiNodeId] = useState("");

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
      } catch {
        setError("Could not load form.");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_id: session.id,
          title,
          task_type: taskType,
          assignee_id: assigneeId,
          due_at,
          priority,
          proof_type: proofType,
          countersign_user_id: proofType === "countersign" ? countersignUserId : null,
          recurrence,
          patient_id: taskType === "patient" ? patientId : null,
          psi_node_id: psiNodeId || null,
        }),
      });
      const body = (await res.json()) as { error?: string; task?: { id: string } };
      if (!res.ok) {
        setError(body.error ?? "Could not create task");
        return;
      }
      router.replace(`/dashboard/tasks/${body.task?.id ?? ""}`);
    } catch {
      setError("Could not create task");
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
          <Link href="/dashboard/tasks" className="font-medium text-[#1A3C5E] underline">
            Back to tasks
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">New task</h1>
        <Link href="/dashboard/tasks" className="text-xs font-medium text-[#1A3C5E] underline">
          Cancel
        </Link>
      </div>

      <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
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
            onChange={(e) => setTaskType(e.target.value as "patient" | "ops")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
          >
            <option value="ops">Ops</option>
            <option value="patient">Patient</option>
          </select>
        </div>

        {taskType === "patient" ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Patient</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
              required
            >
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.uhid})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Assignee</label>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
            required
          >
            <option value="">Select user</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Due date & time</label>
          <input
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
          >
            <option value="">None</option>
            {psiNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title} ({n.type})
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={saving || (taskType === "patient" && !patientId) || !assigneeId || (proofType === "countersign" && !countersignUserId)}
          className="w-full rounded-lg bg-[#1A3C5E] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create task"}
        </button>
      </form>
    </div>
  );
}
