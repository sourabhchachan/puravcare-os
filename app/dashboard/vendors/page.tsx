"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { VendorFormSheet } from "@/components/vendors/VendorFormSheet";
import { useAuth } from "@/lib/hooks/useAuth";

type VendorRow = {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  is_active: boolean;
};

export default function VendorsPage() {
  const { session, loading } = useAuth();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [err, setErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    setErr("");
    try {
      const qs = debounced ? `?q=${encodeURIComponent(debounced)}` : "";
      const res = await fetch(`/api/vendors${qs}`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { vendors?: VendorRow[]; error?: string };
      if (!res.ok) {
        setErr(data.error ?? "Could not load");
        return;
      }
      setVendors(data.vendors ?? []);
    } catch {
      setErr("Could not load");
    } finally {
      setLoadingData(false);
    }
  }, [session, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const isCeo = session?.role === "ceo";
  const canList = session?.role === "ceo" || session?.role === "ops";

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!canList) {
    return <p className="text-sm text-slate-600">You do not have access to this page.</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Vendors</h1>
          <p className="text-sm text-slate-500">Suppliers and purchase indents</p>
        </div>
        {isCeo ? (
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
          >
            New Vendor
          </button>
        ) : null}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
      />

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loadingData ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loadingData && vendors.length === 0 ? <p className="text-sm text-slate-500">No vendors found.</p> : null}

      <ul className="space-y-2">
        {vendors.map((v) => (
          <li key={v.id}>
            <Link
              href={`/dashboard/vendors/${v.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{v.name}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    v.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {v.is_active ? "active" : "inactive"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{v.category ?? "—"}</p>
              <p className="text-xs text-slate-500">{v.phone ?? "—"}</p>
            </Link>
          </li>
        ))}
      </ul>

      {sheet && isCeo ? (
        <VendorFormSheet
          sessionId={session.id}
          mode="create"
          isCeo
          onClose={() => setSheet(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
