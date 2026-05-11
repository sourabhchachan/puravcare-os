"use client";

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type Indent = {
  id: string;
  item_description: string;
  quantity: number | null;
  unit: string | null;
  status: string;
  created_at: string;
};

function indentBadge(status: string) {
  if (status === "pending") return "bg-yellow-100 text-yellow-900";
  if (status === "dispatched") return "bg-blue-100 text-blue-800";
  if (status === "delivered") return "bg-emerald-100 text-emerald-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-600";
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function VendorDispatchedPage() {
  const { session, loading } = useAuth();
  const toast = useToast();
  const [indents, setIndents] = useState<Indent[]>([]);
  const [err, setErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  const load = useCallback(async () => {
    if (!session || session.role !== "vendor") return;
    setLoadingData(true);
    setErr("");
    try {
      const me = await fetch("/api/vendor", { headers: { "x-actor-id": session.id } });
      const meData = (await me.json()) as { vendor?: { id: string } | null };
      if (!me.ok || !meData.vendor?.id) {
        setIndents([]);
        setErr(!meData.vendor ? "Your account is not linked to a vendor record." : "");
        return;
      }
      const res = await fetch(`/api/vendors/${meData.vendor.id}/indents?status=dispatched`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { indents?: Indent[]; error?: string };
      if (!res.ok) {
        setErr(data.error ?? "Could not load");
        toast.error(data.error ?? "Could not load");
        return;
      }
      setIndents(data.indents ?? []);
    } catch {
      setErr("Could not load");
      toast.error("Could not load");
    } finally {
      setLoadingData(false);
    }
  }, [session, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markDelivered(id: string) {
    if (!session) return;
    const res = await fetch(`/api/indents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-actor-id": session.id },
      body: JSON.stringify({ action: "deliver" }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(body.error ?? "Could not mark delivered");
      return;
    }
    toast.success("Marked delivered");
    void load();
  }

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (session.role !== "vendor") {
    return <p className="text-sm text-slate-600">Vendor portal only.</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-xl font-semibold text-slate-900">Dispatched</h1>
      {err ? <p className="text-sm text-amber-800">{err}</p> : null}
      {loadingData ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {!loadingData && indents.length === 0 ? <p className="text-sm text-slate-500">No dispatched indents.</p> : null}

      <ul className="space-y-3">
        {indents.map((i) => (
          <li key={i.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${indentBadge(i.status)}`}>{i.status}</span>
            <p className="mt-2 font-medium text-slate-900">{i.item_description}</p>
            <p className="text-xs text-slate-600">
              Qty: {i.quantity ?? "—"} {i.unit ? `· ${i.unit}` : ""}
            </p>
            <p className="text-xs text-slate-500">{formatDt(i.created_at)}</p>
            <button
              type="button"
              onClick={() => void markDelivered(i.id)}
              className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
            >
              Mark delivered
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
