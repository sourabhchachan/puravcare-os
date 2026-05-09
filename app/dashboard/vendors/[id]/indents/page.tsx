"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type Indent = {
  id: string;
  item_description: string;
  quantity: number | null;
  unit: string | null;
  status: string;
  cancel_reason: string | null;
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

export default function VendorIndentsPage() {
  const params = useParams();
  const vendorId = params.id as string;
  const { session, loading } = useAuth();
  const toast = useToast();
  const [indents, setIndents] = useState<Indent[]>([]);
  const [err, setErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const isCeoOrOps = session?.role === "ceo" || session?.role === "ops";

  const load = useCallback(async () => {
    if (!session || !vendorId) return;
    setLoadingData(true);
    setErr("");
    try {
      const res = await fetch(`/api/vendors/${vendorId}/indents`, { headers: { "x-actor-id": session.id } });
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
  }, [session, vendorId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchIndent(indentId: string, action: "dispatch" | "deliver") {
    if (!session) return;
    const res = await fetch(`/api/indents/${indentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-actor-id": session.id },
      body: JSON.stringify({ action }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(body.error ?? "Update failed");
      return;
    }
    toast.success(action === "dispatch" ? "Marked dispatched" : "Marked delivered");
    void load();
  }

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!isCeoOrOps) {
    return <p className="text-sm text-slate-600">You do not have access to this page.</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      <Link href={`/dashboard/vendors/${vendorId}`} className="text-xs font-medium text-[#2563EB]">
        ← Vendor
      </Link>
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Indents</h1>
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
        >
          New indent
        </button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loadingData ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loadingData && indents.length === 0 ? <p className="text-sm text-slate-500">No indents yet.</p> : null}

      <ul className="space-y-3">
        {indents.map((i) => (
          <li key={i.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${indentBadge(i.status)}`}>{i.status}</span>
            </div>
            <p className="mt-2 font-medium text-slate-900">{i.item_description}</p>
            <p className="text-xs text-slate-600">
              Qty: {i.quantity ?? "—"} {i.unit ? `· ${i.unit}` : ""}
            </p>
            <p className="text-xs text-slate-500">{formatDt(i.created_at)}</p>
            {i.cancel_reason ? <p className="mt-1 text-xs text-red-700">Cancelled: {i.cancel_reason}</p> : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {i.status === "pending" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void patchIndent(i.id, "dispatch")}
                    className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white"
                  >
                    Mark dispatched
                  </button>
                  <button type="button" onClick={() => setCancelId(i.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">
                    Cancel
                  </button>
                </>
              ) : null}
              {i.status === "dispatched" ? (
                <button
                  type="button"
                  onClick={() => void patchIndent(i.id, "deliver")}
                  className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                >
                  Mark delivered
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {sheet ? (
        <NewIndentSheet
          sessionId={session.id}
          vendorId={vendorId}
          onClose={() => setSheet(false)}
          onSaved={() => {
            toast.success("Indent created");
            void load();
          }}
        />
      ) : null}

      {cancelId ? (
        <CancelIndentSheet
          sessionId={session.id}
          indentId={cancelId}
          onClose={() => setCancelId(null)}
          onDone={() => {
            setCancelId(null);
            toast.warning("Indent cancelled");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function NewIndentSheet({
  sessionId,
  vendorId,
  onClose,
  onSaved,
}: {
  sessionId: string;
  vendorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/indents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({
          item_description: desc,
          quantity: qty === "" ? null : Number(qty),
          unit: unit || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed");
        toast.error(data.error ?? "Failed");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Failed");
      toast.error("Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">New indent</h2>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Item description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              required
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Quantity</label>
            <input
              type="number"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Unit</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pieces, boxes…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !desc.trim()}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CancelIndentSheet({
  sessionId,
  indentId,
  onClose,
  onDone,
}: {
  sessionId: string;
  indentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/indents/${indentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ action: "cancel", reason }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed");
        toast.error(data.error ?? "Failed");
        return;
      }
      onDone();
    } catch {
      setError("Failed");
      toast.error("Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Cancel indent</h2>
        <p className="mt-1 text-sm text-slate-600">A reason is required.</p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !reason.trim()}
            className="w-full rounded-lg bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm cancel"}
          </button>
        </form>
      </div>
    </div>
  );
}
