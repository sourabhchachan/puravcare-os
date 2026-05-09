"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/hooks/useAuth";

type ChainRow = {
  id: string;
  title: string;
  chain_type: string;
  status: string;
  step_count: number;
  created_at: string;
};

type TaskOpt = { id: string; title: string; status: string };

function chainStatusBadge(status: string) {
  if (status === "proposed") return "bg-yellow-100 text-yellow-900";
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "active") return "bg-blue-100 text-blue-800";
  if (status === "paused") return "bg-red-100 text-red-800";
  if (status === "completed") return "bg-slate-200 text-slate-600";
  return "bg-slate-100 text-slate-700";
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function ChainTemplatesPage() {
  const { session, loading } = useAuth();
  const [chains, setChains] = useState<ChainRow[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    setLoadErr("");
    try {
      const res = await fetch("/api/chains", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { chains?: ChainRow[]; error?: string };
      if (!res.ok) {
        setLoadErr(data.error ?? "Could not load chains");
        return;
      }
      setChains(data.chains ?? []);
    } catch {
      setLoadErr("Could not load chains");
    } finally {
      setLoadingData(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Chain Templates</h1>
          <p className="text-sm text-slate-500">Vertical (sequential) or horizontal (parallel) task chains</p>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
        >
          New Chain
        </button>
      </div>

      {loadErr ? <p className="text-sm text-red-600">{loadErr}</p> : null}
      {loadingData ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loadingData && chains.length === 0 ? <p className="text-sm text-slate-500">No chains yet.</p> : null}

      <ul className="space-y-2">
        {chains.map((c) => (
          <li key={c.id}>
            <Link
              href={`/dashboard/chain-templates/${c.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${chainStatusBadge(c.status)}`}>
                  {c.status}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{c.chain_type}</span>
              </div>
              <p className="mt-1 font-semibold text-slate-900">{c.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {c.step_count} step{c.step_count === 1 ? "" : "s"} · {formatDt(c.created_at)}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {sheetOpen ? (
        <NewChainSheet sessionId={session.id} onClose={() => setSheetOpen(false)} onSaved={() => void load()} />
      ) : null}
    </div>
  );
}

function NewChainSheet({
  sessionId,
  onClose,
  onSaved,
}: {
  sessionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [chainType, setChainType] = useState<"vertical" | "horizontal">("vertical");
  const [taskOptions, setTaskOptions] = useState<TaskOpt[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tasks?filter=all", { headers: { "x-actor-id": sessionId } });
        const data = (await res.json()) as { tasks?: { id: string; title: string; status: string }[] };
        if (!res.ok || cancelled) return;
        const open = (data.tasks ?? []).filter((t) => t.status !== "closed");
        setTaskOptions(open.map((t) => ({ id: t.id, title: t.title, status: t.status })));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const availablePick = useMemo(() => {
    const set = new Set(selectedIds);
    return taskOptions.filter((t) => !set.has(t.id));
  }, [taskOptions, selectedIds]);

  function addStep() {
    if (!pick) return;
    setSelectedIds((prev) => [...prev, pick]);
    setPick("");
  }

  function move(idx: number, dir: -1 | 1) {
    setSelectedIds((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function removeAt(idx: number) {
    setSelectedIds((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/chains", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ title, chain_type: chainType, task_ids: selectedIds }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      onSaved();
      onClose();
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
        <h2 className="text-lg font-semibold text-[#2563EB]">New chain</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
            <select
              value={chainType}
              onChange={(e) => setChainType(e.target.value as "vertical" | "horizontal")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            >
              <option value="vertical">Vertical (sequential)</option>
              <option value="horizontal">Horizontal (parallel)</option>
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Steps {chainType === "vertical" ? "(ordered)" : ""}</p>
            <div className="flex gap-2">
              <select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              >
                <option value="">Select task…</option>
                {availablePick.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addStep} className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800">
                Add
              </button>
            </div>
            <ol className="mt-2 space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-2">
              {selectedIds.length === 0 ? <li className="text-xs text-slate-500">No steps yet.</li> : null}
              {selectedIds.map((tid, idx) => {
                const t = taskOptions.find((x) => x.id === tid);
                return (
                  <li key={`${tid}-${idx}`} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-sm">
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">{idx + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-800">{t?.title ?? tid}</span>
                    {chainType === "vertical" ? (
                      <span className="flex shrink-0 gap-0.5">
                        <button type="button" className="rounded px-1 text-xs text-slate-600" onClick={() => move(idx, -1)} aria-label="Move up">
                          ↑
                        </button>
                        <button type="button" className="rounded px-1 text-xs text-slate-600" onClick={() => move(idx, 1)} aria-label="Move down">
                          ↓
                        </button>
                      </span>
                    ) : null}
                    <button type="button" className="shrink-0 text-xs text-red-600" onClick={() => removeAt(idx)}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !title.trim() || selectedIds.length === 0}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
