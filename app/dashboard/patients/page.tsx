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
  const [status, setStatus] = useState<"active" | "discharged">("active");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ status, q: search.trim() });
      const res = await fetch(`/api/patients?${q.toString()}`, { headers: { "x-actor-id": session.id } });
      const body = (await res.json()) as { patients?: PatientRow[]; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not load patients");
        toast.error(body.error ?? "Could not load patients");
        return;
      }
      setRows(body.patients ?? []);
    } catch {
      setError("Could not load patients");
      toast.error("Could not load patients");
    } finally {
      setLoading(false);
    }
  }, [session, status, search, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => rows, [rows]);

  if (!session) return null;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Patients</h1>
        <Link href="/dashboard/patients/new" className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white">
          New Patient
        </Link>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStatus("active")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            status === "active" ? "bg-[#2563EB] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
          }`}
        >
          Active
        </button>
        <button
          type="button"
          onClick={() => setStatus("discharged")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            status === "discharged" ? "bg-[#2563EB] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
          }`}
        >
          Discharged
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or UHID"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
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
          {filtered.length === 0 ? <p className="text-sm text-slate-500">No patients found.</p> : null}
        </ul>
      )}
    </div>
  );
}
