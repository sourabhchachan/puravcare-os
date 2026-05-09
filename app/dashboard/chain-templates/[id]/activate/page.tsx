"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";
import { normalizeTemplateTaskType } from "@/lib/task/taskTypes";

type StepRow = {
  id: string;
  task_master_id: string | null;
  step_order: number;
  task_master: { id: string; title: string; task_type: string } | null;
  default_assignee_role: string | null;
  task_id: string | null;
};

type UserOpt = { id: string; full_name: string; role: string };
type PatientOpt = { id: string; full_name: string; uhid: string };

type StepForm = {
  step_id: string;
  assignee_id: string;
  due_at: string;
  patient_id: string;
};

export default function ActivateChainPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { session, loading } = useAuth();
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [chainType, setChainType] = useState("");
  const [status, setStatus] = useState("");
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [form, setForm] = useState<Record<string, StepForm>>({});
  const [loadErr, setLoadErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session || !id) return;
    setLoadingData(true);
    setLoadErr("");
    try {
      const chainRes = await fetch(`/api/chains/${id}`, { headers: { "x-actor-id": session.id } });
      const chainJson = (await chainRes.json()) as {
        chain?: { title: string; chain_type: string; status: string };
        steps?: StepRow[];
        error?: string;
      };
      if (!chainRes.ok) {
        setLoadErr(chainJson.error ?? "Could not load");
        return;
      }
      setTitle(chainJson.chain?.title ?? "");
      setChainType(chainJson.chain?.chain_type ?? "");
      setStatus(chainJson.chain?.status ?? "");
      const list = chainJson.steps ?? [];
      setSteps(list);

      const metaRes = await fetch("/api/task-meta", { headers: { "x-actor-id": session.id } });
      const metaJson = (await metaRes.json()) as { users?: UserOpt[]; patients?: PatientOpt[] };
      const u = metaRes.ok ? metaJson.users ?? [] : [];
      const p = metaRes.ok ? metaJson.patients ?? [] : [];
      setUsers(u);
      setPatients(p);

      const init: Record<string, StepForm> = {};
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      const defaultDue = now.toISOString().slice(0, 16);
      for (const s of list) {
        const roleHint = s.default_assignee_role?.trim();
        const match = roleHint ? u.find((user) => user.role === roleHint) : undefined;
        init[s.id] = {
          step_id: s.id,
          assignee_id: match?.id ?? "",
          due_at: defaultDue,
          patient_id: "",
        };
      }
      setForm(init);
    } catch {
      setLoadErr("Could not load");
    } finally {
      setLoadingData(false);
    }
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (status !== "approved") {
      toast.error("Chain must be approved before activation");
      return;
    }
    const payloadSteps = steps.map((s) => {
      const row = form[s.id];
      return {
        step_id: s.id,
        assignee_id: row?.assignee_id ?? "",
        due_at: row?.due_at ? new Date(row.due_at).toISOString() : "",
        patient_id: normalizeTemplateTaskType(s.task_master?.task_type) === "clinical" ? row?.patient_id?.trim() || null : null,
      };
    });
    for (const p of payloadSteps) {
      if (!p.assignee_id || !p.due_at) {
        toast.error("Assignee and due date required for every step");
        return;
      }
    }
    for (const s of steps) {
      const p = payloadSteps.find((x) => x.step_id === s.id);
      if (normalizeTemplateTaskType(s.task_master?.task_type) === "clinical" && !p?.patient_id) {
        toast.error(`Patient required for clinical step: ${s.task_master?.title ?? s.id}`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/chains/${id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": session.id },
        body: JSON.stringify({ steps: payloadSteps }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Activation failed");
        return;
      }
      toast.success("Chain activated");
      router.push(`/dashboard/chain-templates/${id}`);
    } catch {
      toast.error("Activation failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (loadingData) return <p className="text-sm text-slate-500">Loading…</p>;
  if (loadErr) return <p className="text-sm text-red-600">{loadErr}</p>;

  const isCeoOrOps = session.role === "ceo" || session.role === "ops";
  if (!isCeoOrOps) {
    return <p className="text-sm text-red-600">You do not have access to activate chains.</p>;
  }

  return (
    <div className="space-y-4 pb-10">
      <Link href={`/dashboard/chain-templates/${id}`} className="text-xs font-medium text-[#2563EB]">
        ← Template
      </Link>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Activate chain</h1>
        <p className="mt-1 text-sm text-slate-600">{title}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{chainType}</p>
        {status !== "approved" ? (
          <p className="mt-2 text-sm text-amber-800">This template must be approved before activation.</p>
        ) : null}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {steps.map((s) => {
          const row = form[s.id] ?? { step_id: s.id, assignee_id: "", due_at: "", patient_id: "" };
          const clinical = normalizeTemplateTaskType(s.task_master?.task_type) === "clinical";
          return (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-400">Step {s.step_order}</p>
              <h2 className="text-base font-semibold text-slate-900">{s.task_master?.title ?? "Template"}</h2>
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-slate-600">Assignee</label>
                <select
                  value={row.assignee_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      [s.id]: { ...row, assignee_id: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select user</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role})
                    </option>
                  ))}
                </select>
                <label className="block text-xs font-medium text-slate-600">Due date & time</label>
                <input
                  type="datetime-local"
                  value={row.due_at}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      [s.id]: { ...row, due_at: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
                {clinical ? (
                  <>
                    <label className="block text-xs font-medium text-slate-600">Patient</label>
                    <select
                      value={row.patient_id}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          [s.id]: { ...row, patient_id: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select patient</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({p.uhid})
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
        <button
          type="submit"
          disabled={saving || status !== "approved" || steps.some((s) => s.task_id)}
          className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Creating tasks…" : "Confirm & create tasks"}
        </button>
      </form>
    </div>
  );
}
