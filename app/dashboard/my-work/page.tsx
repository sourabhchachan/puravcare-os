"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type TabId = "assigned" | "raised" | "items_raised" | "items_assigned";

type Row = { id: string; title: string; subtitle: string | null; status: string; href: string };

const TABS: { id: TabId; label: string }[] = [
  { id: "assigned", label: "Assigned to me" },
  { id: "raised", label: "Raised by me" },
  { id: "items_raised", label: "Items I raised" },
  { id: "items_assigned", label: "Items assigned to me" },
];

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "closed" || s === "delivered") return "bg-emerald-100 text-emerald-800";
  if (s === "cancelled") return "bg-red-100 text-red-800";
  if (s === "blocked") return "bg-amber-100 text-amber-900";
  if (s === "done" || s === "confirmed") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

export default function MyWorkPage() {
  const { session, loading } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<TabId>("assigned");
  const [rows, setRows] = useState<Row[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    setLoadErr("");
    try {
      const res = await fetch(`/api/my-work?tab=${tab}`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { rows?: Row[]; error?: string };
      if (!res.ok) {
        setLoadErr(data.error ?? "Could not load");
        toast.error("Could not load My Work");
        return;
      }
      setRows(data.rows ?? []);
    } catch {
      setLoadErr("Could not load");
      toast.error("Could not load My Work");
    } finally {
      setLoadingData(false);
    }
  }, [session, tab, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-xl font-semibold text-slate-900">My work</h1>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === t.id ? "bg-[#2563EB] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadErr ? <p className="text-sm text-red-600">{loadErr}</p> : null}
      {loadingData ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loadingData && rows.length === 0 ? <p className="text-sm text-slate-500">Nothing here yet.</p> : null}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={`${tab}-${r.id}`}>
            <Link
              href={r.href}
              className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(r.status)}`}>{r.status}</span>
              </div>
              <p className="mt-1 font-semibold text-slate-900">{r.title}</p>
              {r.subtitle ? <p className="text-xs text-slate-600">{r.subtitle}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
