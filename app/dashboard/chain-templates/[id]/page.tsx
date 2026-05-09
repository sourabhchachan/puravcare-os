"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { useAuth } from "@/lib/hooks/useAuth";

type Chain = {
  id: string;
  title: string;
  chain_type: string;
  status: string;
  approved_by: string | null;
  created_at: string;
};

type StepRow = {
  id: string;
  task_id: string | null;
  step_order: number;
  status: string;
  skip_reason: string | null;
  task: { id: string; title: string; status: string } | null;
};

function chainStatusBadge(status: string) {
  if (status === "proposed") return "bg-yellow-100 text-yellow-900";
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "active") return "bg-blue-100 text-blue-800";
  if (status === "paused") return "bg-red-100 text-red-800";
  if (status === "completed") return "bg-slate-200 text-slate-600";
  return "bg-slate-100 text-slate-700";
}

function stepBadge(status: string) {
  if (status === "active") return "bg-blue-50 text-blue-800";
  if (status === "completed") return "bg-emerald-50 text-emerald-800";
  if (status === "skipped") return "bg-amber-50 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

export default function ChainDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { session, loading } = useAuth();
  const [chain, setChain] = useState<Chain | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [progress, setProgress] = useState({ closed: 0, total: 0 });
  const [err, setErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [skipStep, setSkipStep] = useState<StepRow | null>(null);

  const isCeoOrOps = session?.role === "ceo" || session?.role === "ops";
  const isCeo = session?.role === "ceo";

  const load = useCallback(async () => {
    if (!session || !id) return;
    setLoadingData(true);
    setErr("");
    try {
      const res = await fetch(`/api/chains/${id}`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { chain?: Chain; steps?: StepRow[]; progress?: { closed: number; total: number }; error?: string };
      if (!res.ok) {
        setErr(data.error ?? "Not found");
        setChain(null);
        return;
      }
      setChain(data.chain ?? null);
      setSteps(data.steps ?? []);
      setProgress(data.progress ?? { closed: 0, total: 0 });
    } catch {
      setErr("Could not load");
      setChain(null);
    } finally {
      setLoadingData(false);
    }
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchChain(action: "approve" | "pause" | "resume") {
    if (!session) return;
    const res = await fetch(`/api/chains/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-actor-id": session.id },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return;
    void load();
  }

  const activeStepId = useMemo(() => {
    if (chain?.chain_type !== "vertical") return null;
    const a = steps.find((s) => s.status === "active");
    return a?.id ?? null;
  }, [chain?.chain_type, steps]);

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (loadingData) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!chain) return <p className="text-sm text-red-600">{err || "Not found"}</p>;

  return (
    <div className="space-y-4 pb-8">
      <Link href="/dashboard/chain-templates" className="text-xs font-medium text-[#2563EB]">
        ← Chains
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${chainStatusBadge(chain.status)}`}>{chain.status}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{chain.chain_type}</span>
        </div>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{chain.title}</h1>
        {chain.chain_type === "horizontal" && progress.total > 0 ? (
          <p className="mt-2 text-sm font-medium text-slate-700">
            Progress: {progress.closed}/{progress.total} closed
          </p>
        ) : null}
      </div>

      {isCeoOrOps ? (
        <div className="flex flex-wrap gap-2">
          {chain.status === "proposed" ? (
            <button type="button" onClick={() => void patchChain("approve")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
              Approve
            </button>
          ) : null}
          {chain.status === "active" || chain.status === "approved" ? (
            <button type="button" onClick={() => void patchChain("pause")} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white">
              Pause
            </button>
          ) : null}
          {chain.status === "paused" ? (
            <button type="button" onClick={() => void patchChain("resume")} className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white">
              Resume
            </button>
          ) : null}
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Steps</h2>
        <ul className="space-y-2">
          {steps.map((s) => {
            const isActiveHighlight = chain.chain_type === "vertical" && s.id === activeStepId;
            return (
              <li
                key={s.id}
                className={`rounded-xl border bg-white p-3 shadow-sm ${
                  isActiveHighlight ? "border-[#2563EB] ring-2 ring-[#2563EB]/30" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">#{s.step_order}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stepBadge(s.status)}`}>{s.status}</span>
                </div>
                <p className="mt-1 font-medium text-slate-900">{s.task?.title ?? "—"}</p>
                <p className="text-xs text-slate-500">Task: {s.task?.status ?? "—"}</p>
                {s.skip_reason ? <p className="mt-1 text-xs text-amber-800">Skip: {s.skip_reason}</p> : null}
                {s.task_id ? (
                  <Link href={`/dashboard/tasks/${s.task_id}`} className="mt-2 inline-block text-xs font-medium text-[#2563EB]">
                    Open task
                  </Link>
                ) : null}
                {isCeo && chain.chain_type === "vertical" && s.status === "active" && s.task?.status === "blocked" ? (
                  <button type="button" onClick={() => setSkipStep(s)} className="mt-2 block text-xs font-semibold text-amber-800 underline">
                    Force-skip step
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {skipStep && session ? (
        <ForceSkipSheet
          chainId={id}
          stepId={skipStep.id}
          sessionId={session.id}
          stepTitle={skipStep.task?.title ?? "Task"}
          onClose={() => setSkipStep(null)}
          onDone={() => {
            setSkipStep(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function ForceSkipSheet({
  chainId,
  stepId,
  sessionId,
  stepTitle,
  onClose,
  onDone,
}: {
  chainId: string;
  stepId: string;
  sessionId: string;
  stepTitle: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/chains/${chainId}/force-skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ step_id: stepId, reason }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed");
        return;
      }
      onDone();
    } catch {
      setError("Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Force-skip</h2>
        <p className="mt-1 text-sm text-slate-600">{stepTitle}</p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !reason.trim()}
            className="w-full rounded-lg bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm skip"}
          </button>
        </form>
      </div>
    </div>
  );
}
