"use client";

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";

type AttendanceRow = {
  id: string;
  punch_in: string;
  punch_out: string | null;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function AttendancePunchPanel({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openRecord, setOpenRecord] = useState<AttendanceRow | null>(null);
  const [todayRecords, setTodayRecords] = useState<AttendanceRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance?_=${Date.now()}`, {
        headers: { "x-actor-id": sessionId },
        cache: "no-store",
      });
      const data = (await res.json()) as {
        open_record?: AttendanceRow | null;
        today_records?: AttendanceRow[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Could not load attendance");
        return;
      }
      setOpenRecord(data.open_record ?? null);
      setTodayRecords(data.today_records ?? []);
    } catch {
      toast.error("Could not load attendance");
    } finally {
      setLoading(false);
    }
  }, [sessionId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function punch(action: "punch_in" | "punch_out") {
    setBusy(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const msg =
          data.error === "already_punched_in"
            ? "You are already punched in"
            : data.error === "no_open_punch"
              ? "No open punch-in to close"
              : data.error ?? "Action failed";
        toast.error(msg);
        return;
      }
      toast.success(action === "punch_in" ? "Punched in" : "Punched out");
      await load();
    } catch {
      toast.error("Action failed");
    } finally {
      setBusy(false);
    }
  }

  const lastClosed = [...todayRecords].reverse().find((r) => r.punch_out);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Attendance</h2>
      {loading ? (
        <p className="mt-2 text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-700">
            {openRecord
              ? `Punched in at ${formatTime(openRecord.punch_in)}`
              : "Not punched in"}
          </p>
          {lastClosed ? (
            <p className="mt-1 text-xs text-slate-500">
              Last session: in {formatTime(lastClosed.punch_in)}
              {lastClosed.punch_out ? ` · out ${formatTime(lastClosed.punch_out)}` : ""}
            </p>
          ) : null}
          {todayRecords.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {todayRecords.map((r) => (
                <li key={r.id}>
                  In {formatTime(r.punch_in)}
                  {r.punch_out ? ` · Out ${formatTime(r.punch_out)}` : " · (open)"}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4">
            {openRecord ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void punch("punch_out")}
                className="w-full rounded-xl bg-amber-600 py-4 text-base font-bold text-white disabled:opacity-50"
              >
                Punch Out
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void punch("punch_in")}
                className="w-full rounded-xl bg-emerald-600 py-4 text-base font-bold text-white disabled:opacity-50"
              >
                Punch In
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
