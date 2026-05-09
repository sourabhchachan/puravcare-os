"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { VendorFormSheet } from "@/components/vendors/VendorFormSheet";
import { useAuth } from "@/lib/hooks/useAuth";

type VendorRow = {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  user_id: string | null;
  is_active: boolean;
};

type IndentPreview = { id: string; item_description: string; status: string; created_at: string };
type ItemRow = { id: string; name: string; price: number; is_active: boolean };

function indentBadge(status: string) {
  if (status === "pending") return "bg-yellow-100 text-yellow-900";
  if (status === "dispatched") return "bg-blue-100 text-blue-800";
  if (status === "delivered") return "bg-emerald-100 text-emerald-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-600";
}

export default function VendorDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { session, loading } = useAuth();
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [indents, setIndents] = useState<IndentPreview[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [linkedLabel, setLinkedLabel] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const isCeo = session?.role === "ceo";
  const isCeoOrOps = session?.role === "ceo" || session?.role === "ops";

  const load = useCallback(async () => {
    if (!session || !id) return;
    setLoadingData(true);
    setErr("");
    try {
      const res = await fetch(`/api/vendors/${id}`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as {
        vendor?: VendorRow;
        indents?: IndentPreview[];
        items?: ItemRow[];
        linked_user_label?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setErr(data.error ?? "Not found");
        setVendor(null);
        return;
      }
      setVendor(data.vendor ?? null);
      setIndents(data.indents ?? []);
      setItems(data.items ?? []);
      setLinkedLabel(data.linked_user_label ?? null);
    } catch {
      setErr("Could not load");
      setVendor(null);
    } finally {
      setLoadingData(false);
    }
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (loadingData) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!vendor) return <p className="text-sm text-red-600">{err || "Not found"}</p>;

  const preview = indents.slice(0, 5);

  return (
    <div className="space-y-4 pb-8">
      <Link href="/dashboard/vendors" className="text-xs font-medium text-[#2563EB]">
        ← Vendors
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{vendor.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{vendor.category ?? "—"}</p>
            <p className="text-sm text-slate-500">{vendor.phone ?? "—"}</p>
            {linkedLabel ? <p className="mt-2 text-xs text-slate-600">Linked: {linkedLabel}</p> : null}
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              vendor.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
            }`}
          >
            {vendor.is_active ? "active" : "inactive"}
          </span>
        </div>
        {isCeo ? (
          <button type="button" onClick={() => setEditOpen(true)} className="mt-3 text-xs font-semibold text-[#2563EB]">
            Edit vendor
          </button>
        ) : null}
      </div>

      {isCeoOrOps ? (
        <Link
          href={`/dashboard/vendors/${id}/indents`}
          className="block rounded-xl border border-[#2563EB]/30 bg-blue-50/50 p-4 text-sm font-semibold text-[#2563EB] shadow-sm"
        >
          Indents → manage purchase orders
        </Link>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Recent indents</h2>
          {isCeoOrOps ? (
            <Link href={`/dashboard/vendors/${id}/indents`} className="text-xs font-medium text-[#2563EB]">
              View all
            </Link>
          ) : null}
        </div>
        {preview.length === 0 ? (
          <p className="text-sm text-slate-500">No indents yet.</p>
        ) : (
          <ul className="space-y-2">
            {preview.map((i) => (
              <li key={i.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${indentBadge(i.status)}`}>{i.status}</span>
                {i.item_description}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Items from master</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No items linked.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <span className="font-medium text-slate-900">{it.name}</span>
                <span className="ml-2 text-xs text-slate-500">₹{Number(it.price).toFixed(2)}</span>
                {!it.is_active ? <span className="ml-2 text-[10px] font-semibold text-slate-400">inactive</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editOpen && isCeo ? (
        <VendorFormSheet
          sessionId={session.id}
          mode="edit"
          vendorId={vendor.id}
          initial={vendor}
          isCeo
          onClose={() => setEditOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
