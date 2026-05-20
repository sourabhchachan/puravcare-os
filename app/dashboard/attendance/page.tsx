"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type RecordRow = {
  id: string;
  user_name: string;
  date: string;
  punch_in: string;
  punch_out: string | null;
  total_hours: number | null;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function AttendancePage() {
  const { session, loading: authLoading } = useAuth();
  const toast = useToast();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return ymd(d);
  });
  const [to, setTo] = useState(ymd(new Date()));
  const [userSearch, setUserSearch] = useState("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canAccess = session && (session.role === "ceo" || session.role === "ops");

  const load = useCallback(async () => {
    if (!session || !canAccess) return;
    setLoading(true);
    setError("");
    try {
      const qp = new URLSearchParams({ scope: "report", from, to });
      if (userSearch.trim()) qp.set("user", userSearch.trim());
      const res = await fetch(`/api/attendance?${qp}`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { records?: RecordRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load attendance");
        toast.error(data.error ?? "Could not load attendance");
        return;
      }
      setRecords(data.records ?? []);
    } catch {
      setError("Could not load attendance");
      toast.error("Could not load attendance");
    } finally {
      setLoading(false);
    }
  }, [session, canAccess, from, to, userSearch, toast]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [load, canAccess]);

  const shown = useMemo(() => records, [records]);

  function exportExcel() {
    try {
      if (!shown.length) {
        toast.warning("No records to export");
        return;
      }
      const rows = shown.map((r) => ({
        "User name": r.user_name,
        Date: r.date,
        "Punch in": formatTime(r.punch_in),
        "Punch out": r.punch_out ? formatTime(r.punch_out) : "",
        "Total hours": r.total_hours ?? "",
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");
      XLSX.writeFile(wb, `attendance-${from}-to-${to}.xlsx`);
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed");
    }
  }

  if (authLoading || !session) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (!canAccess) {
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
          <h1 className="text-xl font-semibold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500">Punch records for all users</p>
        </div>
        <button
          type="button"
          onClick={() => exportExcel()}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#2563EB]"
        >
          Export Excel
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <input
        type="search"
        value={userSearch}
        onChange={(e) => setUserSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void load();
        }}
        placeholder="Filter by user name…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
      />

      <button
        type="button"
        onClick={() => void load()}
        className="w-full rounded-lg bg-[#2563EB] py-2 text-sm font-semibold text-white"
      >
        Apply filters
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <p className="font-semibold text-slate-900">{r.user_name}</p>
              <p className="text-xs text-slate-600">{formatDate(r.date)}</p>
              <p className="mt-2 text-xs text-slate-700">
                In: {formatTime(r.punch_in)}
                {r.punch_out ? ` · Out: ${formatTime(r.punch_out)}` : " · Still in"}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-800">
                Total hours: {r.total_hours != null ? r.total_hours : "—"}
              </p>
            </li>
          ))}
          {shown.length === 0 ? <p className="text-sm text-slate-500">No records for this range.</p> : null}
        </ul>
      )}
    </div>
  );
}
