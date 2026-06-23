"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type PatientRow = {
  id: string;
  uhid: string;
  full_name: string;
  age: number | null;
  admission_type: "opd" | "ipd";
  bed_number: string | null;
  ipd_number: string | null;
  admission_date: string;
  status: "active" | "discharged";
};

type SortId = "az" | "za" | "admission_new" | "admission_old";
type StatusFilter = "all" | "active" | "discharged";

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3 20a6 6 0 0112 0M13.5 20a4.5 4.5 0 019 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

export default function PatientsPage() {
  const { session } = useAuth();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortId>("az");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const q = search.trim();
      const qParam = q ? `&q=${encodeURIComponent(q)}` : "";
      const headers = { "x-actor-id": session.id };
      const [activeRes, dischargedRes] = await Promise.all([
        fetch(`/api/patients?status=active${qParam}`, { headers }),
        fetch(`/api/patients?status=discharged${qParam}`, { headers }),
      ]);
      const [activeBody, dischargedBody] = await Promise.all([
        activeRes.json() as Promise<{ patients?: PatientRow[]; error?: string }>,
        dischargedRes.json() as Promise<{ patients?: PatientRow[]; error?: string }>,
      ]);
      if (!activeRes.ok || !dischargedRes.ok) {
        const err = activeBody.error ?? dischargedBody.error ?? "Could not load patients";
        setError(err);
        toast.error(err);
        return;
      }
      const merged = [...(activeBody.patients ?? []), ...(dischargedBody.patients ?? [])];
      const byId = new Map<string, PatientRow>();
      for (const p of merged) byId.set(p.id, p);
      setRows([...byId.values()]);
    } catch {
      setError("Could not load patients");
      toast.error("Could not load patients");
    } finally {
      setLoading(false);
    }
  }, [session, search, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list =
      statusFilter === "all"
        ? [...rows]
        : rows.filter((p) => p.status === statusFilter);
    list = [...list].sort((a, b) => {
      if (sort === "az") return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" });
      if (sort === "za") return b.full_name.localeCompare(a.full_name, undefined, { sensitivity: "base" });
      const aTs = new Date(a.admission_date).getTime();
      const bTs = new Date(b.admission_date).getTime();
      if (sort === "admission_new") return bTs - aTs;
      return aTs - bTs;
    });
    return list;
  }, [rows, statusFilter, sort]);

  if (!session) return null;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold text-gray-900">Patients</h1>
        {session.role === "ceo" || session.role === "ops" ? (
          <Link href="/dashboard/patients/new" className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-all active:scale-95 hover:bg-blue-700">
            New Patient
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "all" as const, label: "All" },
            { id: "active" as const, label: "Admitted only" },
            { id: "discharged" as const, label: "Discharged only" },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStatusFilter(s.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              statusFilter === s.id ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "az" as const, label: "A–Z" },
            { id: "za" as const, label: "Z–A" },
            { id: "admission_new" as const, label: "Newest admission" },
            { id: "admission_old" as const, label: "Oldest admission" },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSort(s.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              sort === s.id ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or UHID"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <div className="space-y-3">
          <div className="pc-skeleton h-24" />
          <div className="pc-skeleton h-24" />
          <div className="pc-skeleton h-24" />
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link href={`/dashboard/patients/${p.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">{p.uhid}</p>
                    <p className="font-semibold text-slate-900">{p.full_name}</p>
                    <p className="text-xs text-slate-500">Age: {p.age ?? "—"}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                      p.admission_type === "ipd" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {p.admission_type.toUpperCase()}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  {p.admission_type === "ipd" ? <>Bed: {p.bed_number || "—"} · </> : null}
                  {p.admission_type === "ipd" ? <>IPD: {p.ipd_number || "—"} · </> : null}
                  Admitted: {fmtDate(p.admission_date)}
                </div>
              </Link>
            </li>
          ))}
          {filtered.length === 0 ? (
            <div className="pc-empty-state">
              <EmptyIcon className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">No items yet</p>
            </div>
          ) : null}
        </ul>
      )}
    </div>
  );
}
