"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { downloadExcelResponse } from "@/lib/dashboard/downloadExcel";
import type { ReportPreset } from "@/lib/dashboard/reportRange";
import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type AuditRow = {
  id: string;
  source: "task" | "indent";
  task_id: string | null;
  indent_id: string | null;
  item_name: string;
  task_title: string | null;
  event_type: string;
  actor_id: string;
  actor_name: string;
  patient_ipd: string | null;
  patient_name: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
};

type UserOpt = { id: string; full_name: string };

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function AuditLogPage() {
  const { session, loading } = useAuth();
  const toast = useToast();
  const [preset, setPreset] = useState<ReportPreset>("this_month");
  const [from, setFrom] = useState(ymd(new Date()));
  const [to, setTo] = useState(ymd(new Date()));
  const [eventType, setEventType] = useState("");
  const [actorId, setActorId] = useState("");
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [actors, setActors] = useState<UserOpt[]>([]);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const queryString = useMemo(() => {
    const qp = new URLSearchParams({ preset });
    if (eventType) qp.set("event_type", eventType);
    if (actorId) qp.set("actor_id", actorId);
    if (preset === "custom") {
      qp.set("start", new Date(from + "T00:00:00").toISOString());
      qp.set("end", new Date(to + "T23:59:59").toISOString());
    }
    return qp.toString();
  }, [preset, from, to, eventType, actorId]);

  const loadActors = useCallback(async () => {
    if (!session || session.role !== "ceo") return;
    const res = await fetch("/api/users", { headers: { "x-actor-id": session.id } });
    const data = (await res.json()) as { users?: { id: string; full_name: string }[] };
    if (res.ok) setActors((data.users ?? []).map((u) => ({ id: u.id, full_name: u.full_name })));
  }, [session]);

  const load = useCallback(async () => {
    if (!session || session.role !== "ceo") return;
    setLoadingData(true);
    setError("");
    try {
      const res = await fetch(`/api/audit-log?${queryString}`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { events?: AuditRow[]; event_types?: string[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load");
        toast.error(data.error ?? "Could not load");
        return;
      }
      setRows(data.events ?? []);
      if (data.event_types?.length) setEventTypes(data.event_types);
    } catch {
      setError("Could not load");
      toast.error("Could not load");
    } finally {
      setLoadingData(false);
    }
  }, [session, queryString, toast]);

  useEffect(() => {
    void loadActors();
  }, [loadActors]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportExcel() {
    if (!session) return;
    const res = await fetch(`/api/audit-log/export?${queryString}`, { headers: { "x-actor-id": session.id } });
    if (!res.ok) {
      toast.error("Export failed");
      return;
    }
    await downloadExcelResponse(res, "audit-log.xlsx");
    toast.success("Export downloaded");
  }

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (session.role !== "ceo") {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700 shadow-sm">CEO only.</div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Audit log</h1>
          <p className="text-sm text-slate-500">Task and indent events</p>
        </div>
        <button
          type="button"
          onClick={() => void exportExcel()}
          className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
        >
          Export Excel
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-slate-600">Date range</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["this_month", "This month"],
              ["last_month", "Last month"],
              ["this_year", "This year"],
              ["custom", "Custom"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreset(id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                preset === id ? "bg-[#2563EB] text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="mt-3 flex gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm" />
          </div>
        ) : null}

        <p className="mb-1 mt-4 text-xs font-semibold text-slate-600">Event type</p>
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <p className="mb-1 mt-3 text-xs font-semibold text-slate-600">Actor</p>
        <select
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All staff</option>
          {actors.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loadingData ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loadingData && rows.length === 0 ? <p className="text-sm text-slate-500">No events match.</p> : null}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
            <p className="text-xs text-slate-500">{formatDt(r.created_at)}</p>
            <p className="font-semibold text-slate-900">{r.item_name}</p>
            <p className="text-xs font-medium capitalize text-[#2563EB]">{r.event_type.replace(/_/g, " ")}</p>
            <p className="text-xs text-slate-600">
              Actor: {r.actor_name}
              <span className="block">Type: {r.source}</span>
              <span className="block">
                Patient: {r.patient_ipd ? `${r.patient_ipd} · ${r.patient_name ?? "—"}` : "—"}
              </span>
              <span className="block">
                {r.old_value ?? "—"} → {r.new_value ?? "—"}
              </span>
              {r.note ? <span className="block text-slate-500">{r.note}</span> : null}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
