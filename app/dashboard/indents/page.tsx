"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type IndentRow = {
  id: string;
  item_description: string;
  quantity: number | null;
  unit: string | null;
  status: string;
  priority: "critical" | "high" | "medium" | "low";
  ipd_number: string | null;
  raised_by_name: string;
  created_by: string | null;
  created_at: string;
  vendor_name?: string;
};

type ItemOpt = {
  id: string;
  name: string;
  vendor_id: string;
  vendor_name: string;
};

function statusBadge(status: string) {
  if (status === "pending") return "bg-yellow-100 text-yellow-900";
  if (status === "dispatched") return "bg-blue-100 text-blue-800";
  if (status === "delivered") return "bg-emerald-100 text-emerald-800";
  if (status === "blocked") return "bg-orange-100 text-orange-900";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-600";
}

function priorityBadge(priority: string) {
  if (priority === "critical") return "bg-red-100 text-red-800";
  if (priority === "high") return "bg-orange-100 text-orange-800";
  if (priority === "medium") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function IndentsPage() {
  const { session, loading } = useAuth();
  const toast = useToast();
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [indents, setIndents] = useState<IndentRow[]>([]);
  const [items, setItems] = useState<ItemOpt[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [blockIndentId, setBlockIndentId] = useState<string | null>(null);
  const [cancelIndentId, setCancelIndentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    setError("");
    try {
      const res = await fetch("/api/indents", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { indents?: IndentRow[]; items?: ItemOpt[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load indents");
        toast.error(data.error ?? "Could not load indents");
        return;
      }
      setIndents(data.indents ?? []);
      setItems(data.items ?? []);
    } catch {
      setError("Could not load indents");
      toast.error("Could not load indents");
    } finally {
      setLoadingData(false);
    }
  }, [session, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  const canRaiseIndent = session.role === "ceo" || session.role === "ops" || session.role === "staff";

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Indents</h1>
        {canRaiseIndent ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
          >
            Raise indent
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loadingData ? (
        <div className="space-y-3">
          <div className="pc-skeleton h-24" />
          <div className="pc-skeleton h-24" />
          <div className="pc-skeleton h-24" />
        </div>
      ) : indents.length === 0 ? (
        <div className="pc-empty-state">
          <p className="text-sm text-gray-500">No indents yet</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {indents.map((i) => (
            <li key={i.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(i.status)}`}>{i.status}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityBadge(i.priority)}`}>{i.priority}</span>
                </div>
                <span className="text-xs text-slate-500">{formatDt(i.created_at)}</span>
              </div>
              <p className="mt-2 font-semibold text-slate-900">{i.item_description}</p>
              <p className="mt-1 text-xs text-slate-600">
                Qty: {i.quantity ?? "—"} {i.unit ? `· ${i.unit}` : ""}
              </p>
              <p className="mt-1 text-xs text-slate-600">IPD: {i.ipd_number ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-600">Raised by: {i.raised_by_name ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-500">Vendor: {i.vendor_name ?? "—"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {session.role === "vendor" && (i.status === "pending" || i.status === "dispatched") ? (
                  <button
                    type="button"
                    onClick={() => setBlockIndentId(i.id)}
                    className="rounded-lg bg-orange-500 px-2 py-1 text-xs font-semibold text-white"
                  >
                    Block
                  </button>
                ) : null}
                {(session.role === "ceo" || i.created_by === session.id) && i.status === "pending" ? (
                  <button
                    type="button"
                    onClick={() => setCancelIndentId(i.id)}
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {sheetOpen ? (
        <RaiseIndentSheet
          sessionId={session.id}
          items={items}
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            setSheetOpen(false);
            toast.success("Indent raised");
            void load();
          }}
        />
      ) : null}

      {blockIndentId ? (
        <ReasonSheet
          title="Block indent"
          buttonLabel="Confirm block"
          placeholder="Reason for blocking"
          sessionId={session.id}
          indentId={blockIndentId}
          action="block"
          reasonKey="block_reason"
          onClose={() => setBlockIndentId(null)}
          onSaved={() => {
            setBlockIndentId(null);
            toast.warning("Indent blocked");
            void load();
          }}
        />
      ) : null}

      {cancelIndentId ? (
        <ReasonSheet
          title="Cancel indent"
          buttonLabel="Confirm cancel"
          placeholder="Reason for cancellation"
          sessionId={session.id}
          indentId={cancelIndentId}
          action="cancel"
          reasonKey="cancel_reason"
          onClose={() => setCancelIndentId(null)}
          onSaved={() => {
            setCancelIndentId(null);
            toast.warning("Indent cancelled");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function RaiseIndentSheet({
  sessionId,
  items,
  onClose,
  onSaved,
}: {
  sessionId: string;
  items: ItemOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [priority, setPriority] = useState<"critical" | "high" | "medium" | "low">("medium");
  const [ipdNumber, setIpdNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/indents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ item_id: itemId, quantity: Number(quantity), priority, ipd_number: ipdNumber || null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not raise indent");
        toast.error(data.error ?? "Could not raise indent");
        return;
      }
      onSaved();
    } catch {
      setError("Could not raise indent");
      toast.error("Could not raise indent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Raise indent</h2>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            >
              <option value="">Select item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.vendor_name})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Quantity</label>
            <input
              type="number"
              step="any"
              min="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Patient IPD Number (optional)</label>
            <input
              value={ipdNumber}
              onChange={(e) => setIpdNumber(e.target.value)}
              placeholder="IPD-XXXX"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !itemId || !quantity}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ReasonSheet({
  title,
  buttonLabel,
  placeholder,
  sessionId,
  indentId,
  action,
  reasonKey,
  onClose,
  onSaved,
}: {
  title: string;
  buttonLabel: string;
  placeholder: string;
  sessionId: string;
  indentId: string;
  action: "block" | "cancel";
  reasonKey: "block_reason" | "cancel_reason";
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/indents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ indent_id: indentId, action, [reasonKey]: reason }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update indent");
        toast.error(data.error ?? "Could not update indent");
        return;
      }
      onSaved();
    } catch {
      setError("Could not update indent");
      toast.error("Could not update indent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">{title}</h2>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={3}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !reason.trim()}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : buttonLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
