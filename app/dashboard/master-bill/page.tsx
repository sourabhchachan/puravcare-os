"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type ByPatient = { patient_id: string; uhid: string; patient_name: string; total_bill: number };
type ByItem = { item_id: string; item_name: string; total_quantity: number; total_revenue: number };
type ByVendor = { vendor_id: string; vendor_name: string; total_quantity: number; total_revenue: number };
type Tab = "patient" | "item" | "vendor";
type Preset = "this_month" | "last_month" | "this_year" | "custom";

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function MasterBillPage() {
  const { session } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("patient");
  const [preset, setPreset] = useState<Preset>("this_month");
  const [from, setFrom] = useState(ymd(new Date()));
  const [to, setTo] = useState(ymd(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [byPatient, setByPatient] = useState<ByPatient[]>([]);
  const [byItem, setByItem] = useState<ByItem[]>([]);
  const [byVendor, setByVendor] = useState<ByVendor[]>([]);

  const queryString = useMemo(() => {
    const qp = new URLSearchParams({ preset });
    if (preset === "custom") {
      qp.set("start", new Date(from + "T00:00:00").toISOString());
      qp.set("end", new Date(to + "T23:59:59").toISOString());
    }
    return qp.toString();
  }, [preset, from, to]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/master-bill?${queryString}`, { headers: { "x-actor-id": session.id } });
      const body = (await res.json()) as {
        error?: string;
        by_patient?: ByPatient[];
        by_item?: ByItem[];
        by_vendor?: ByVendor[];
      };
      if (!res.ok) {
        setError(body.error ?? "Could not load master bill");
        toast.error(body.error ?? "Could not load master bill");
        return;
      }
      setByPatient(body.by_patient ?? []);
      setByItem(body.by_item ?? []);
      setByVendor(body.by_vendor ?? []);
    } catch {
      setError("Could not load master bill");
      toast.error("Could not load master bill");
    } finally {
      setLoading(false);
    }
  }, [session, queryString, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCurrent() {
    if (!session) return;
    const params = new URLSearchParams({ tab, preset });
    if (preset === "custom") {
      params.set("start", new Date(from + "T00:00:00").toISOString());
      params.set("end", new Date(to + "T23:59:59").toISOString());
    }
    const res = await fetch(`/api/master-bill/export?${params.toString()}`, { headers: { "x-actor-id": session.id } });
    if (!res.ok) {
      toast.error("Export failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `master-bill-${tab}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
  }

  if (!session) return null;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Master Bill</h1>
        <button type="button" onClick={() => void exportCurrent()} className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white">
          Export Excel
        </button>
      </div>

      <div className="flex gap-2">
        {([
          ["patient", "By Patient"],
          ["item", "By Item"],
          ["vendor", "By Vendor"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === id ? "bg-[#2563EB] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {([
            ["this_month", "This month"],
            ["last_month", "Last month"],
            ["this_year", "This year"],
            ["custom", "Custom"],
          ] as const).map(([id, label]) => (
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
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}

      {!loading && tab === "patient" ? (
        <ul className="space-y-2">
          {byPatient.map((r) => (
            <li key={r.patient_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{r.uhid}</p>
              <p className="font-semibold text-slate-900">{r.patient_name}</p>
              <p className="text-sm font-semibold text-slate-800">{formatInr(Number(r.total_bill))}</p>
            </li>
          ))}
          {byPatient.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : null}
        </ul>
      ) : null}

      {!loading && tab === "item" ? (
        <ul className="space-y-2">
          {byItem.map((r) => (
            <li key={r.item_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="font-semibold text-slate-900">{r.item_name}</p>
              <p className="text-xs text-slate-600">Qty: {r.total_quantity}</p>
              <p className="text-sm font-semibold text-slate-800">{formatInr(Number(r.total_revenue))}</p>
            </li>
          ))}
          {byItem.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : null}
        </ul>
      ) : null}

      {!loading && tab === "vendor" ? (
        <ul className="space-y-2">
          {byVendor.map((r) => (
            <li key={r.vendor_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="font-semibold text-slate-900">{r.vendor_name}</p>
              <p className="text-xs text-slate-600">Qty: {r.total_quantity}</p>
              <p className="text-sm font-semibold text-slate-800">{formatInr(Number(r.total_revenue))}</p>
            </li>
          ))}
          {byVendor.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : null}
        </ul>
      ) : null}
    </div>
  );
}
