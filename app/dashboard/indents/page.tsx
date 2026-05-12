"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { IdCombobox } from "@/components/ui/IdCombobox";
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
  received_at?: string | null;
  vendor_name?: string;
};

type ItemOpt = {
  id: string;
  name: string;
  vendor_id: string;
  vendor_name: string;
};

type PatientOpt = {
  id: string;
  full_name: string;
  ipd_number: string;
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
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [blockIndentId, setBlockIndentId] = useState<string | null>(null);
  const [cancelIndentId, setCancelIndentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchIpd, setSearchIpd] = useState("");
  const [searchItem, setSearchItem] = useState("");
  const [searchRaisedBy, setSearchRaisedBy] = useState("");
  const [sortBy, setSortBy] = useState("date_newest");

  const load = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    setError("");
    try {
      const res = await fetch("/api/indents", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { indents?: IndentRow[]; items?: ItemOpt[]; patients?: PatientOpt[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load indents");
        toast.error(data.error ?? "Could not load indents");
        return;
      }
      setIndents(data.indents ?? []);
      setItems(data.items ?? []);
      setPatients(data.patients ?? []);
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

  const vendorOptions = useMemo(() => {
    const names = [...new Set(indents.map((i) => (i.vendor_name ?? "").trim()).filter(Boolean))];
    return names.sort((a, b) => a.localeCompare(b));
  }, [indents]);

  const shownIndents = useMemo(() => {
    const ipdNeedle = searchIpd.trim().toLowerCase();
    const itemNeedle = searchItem.trim().toLowerCase();
    const raisedNeedle = searchRaisedBy.trim().toLowerCase();
    const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

    const filtered = indents.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (vendorFilter !== "all" && (i.vendor_name ?? "—") !== vendorFilter) return false;
      if (ipdNeedle && !(i.ipd_number ?? "").toLowerCase().includes(ipdNeedle)) return false;
      if (itemNeedle && !(i.item_description ?? "").toLowerCase().includes(itemNeedle)) return false;
      if (raisedNeedle && !(i.raised_by_name ?? "").toLowerCase().includes(raisedNeedle)) return false;
      const createdTs = new Date(i.created_at).getTime();
      if (fromTs != null && createdTs < fromTs) return false;
      if (toTs != null && createdTs > toTs) return false;
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === "date_oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "item_az") return a.item_description.localeCompare(b.item_description);
      if (sortBy === "vendor_az") return (a.vendor_name ?? "").localeCompare(b.vendor_name ?? "");
      if (sortBy === "priority") return (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return sorted;
  }, [fromDate, indents, searchIpd, searchItem, searchRaisedBy, sortBy, statusFilter, toDate, vendorFilter]);

  async function markReceived(indentId: string) {
    if (!session) return;
    try {
      const res = await fetch(`/api/indents/${indentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": session.id },
        body: JSON.stringify({ action: "receive" }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        console.error("[markReceived] PATCH /api/indents failed", {
          status: res.status,
          indentId,
          response: data,
        });
        toast.error(data.error ?? "Could not mark indent as received");
        return;
      }
      toast.success(data.message ?? "Marked received");
      void load();
    } catch (e) {
      console.error("[markReceived] request failed", { indentId, error: e });
      toast.error("Could not mark indent as received");
    }
  }

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

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="dispatched">Dispatched</option>
            <option value="delivered">Delivered</option>
            <option value="blocked">Blocked</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All vendors</option>
            {vendorOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Search IPD number"
            value={searchIpd}
            onChange={(e) => setSearchIpd(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Search item name"
            value={searchItem}
            onChange={(e) => setSearchItem(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Search raised by"
            value={searchRaisedBy}
            onChange={(e) => setSearchRaisedBy(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="date_newest">Date: newest first</option>
            <option value="date_oldest">Date: oldest first</option>
            <option value="item_az">Item: A-Z</option>
            <option value="vendor_az">Vendor: A-Z</option>
            <option value="priority">Priority</option>
          </select>
        </div>
      </div>

      {loadingData ? (
        <div className="space-y-3">
          <div className="pc-skeleton h-24" />
          <div className="pc-skeleton h-24" />
          <div className="pc-skeleton h-24" />
        </div>
      ) : shownIndents.length === 0 ? (
        <div className="pc-empty-state">
          <p className="text-sm text-gray-500">No indents match your filters</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {shownIndents.map((i) => (
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
              {i.status === "delivered" ? <p className="mt-1 text-xs text-slate-500">Received at: {i.received_at ? formatDt(i.received_at) : "—"}</p> : null}
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
                {(session.role === "ceo" || session.role === "ops" || i.created_by === session.id) && i.status === "dispatched" ? (
                  <button
                    type="button"
                    onClick={() => void markReceived(i.id)}
                    className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                  >
                    Mark Received
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
          patients={patients}
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
  patients,
  onClose,
  onSaved,
}: {
  sessionId: string;
  items: ItemOpt[];
  patients: PatientOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [priority, setPriority] = useState<"critical" | "high" | "medium" | "low">("medium");
  const [patientId, setPatientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const itemOptions = useMemo(
    () => items.map((item) => ({ id: item.id, label: `${item.name} (${item.vendor_name})` })),
    [items],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/indents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ item_id: itemId, quantity: Number(quantity), priority, patient_id: patientId }),
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
            <IdCombobox
              id="raise-indent-item"
              label="Item"
              value={itemId}
              onChange={setItemId}
              options={itemOptions}
              placeholder="Type to filter items…"
            />
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Patient IPD Number</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            >
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ipd_number} · {p.full_name}
                </option>
              ))}
            </select>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !itemId || !quantity || !patientId}
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
  onClose,
  onSaved,
}: {
  title: string;
  buttonLabel: string;
  placeholder: string;
  sessionId: string;
  indentId: string;
  action: "block" | "cancel";
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
      const res = await fetch(`/api/indents/${indentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ action, reason }),
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
