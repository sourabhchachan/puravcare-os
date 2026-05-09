"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type ItemOpt = { id: string; name: string; price: number };
type PatientRow = {
  id: string;
  uhid: string;
  full_name: string;
  age: number | null;
  gender: string | null;
  phone: string | null;
  bed_number: string | null;
  admission_type: "opd" | "ipd";
  admission_date: string;
  discharge_date: string | null;
  status: "active" | "discharged";
};
type BillRow = {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  billed_by_name: string;
  billed_at: string;
  status: "active" | "cancelled";
  note: string | null;
  cancel_reason: string | null;
  can_cancel: boolean;
};

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return d;
  }
}

export default function PatientDetailPage() {
  const params = useParams();
  const patientId = params.id as string;
  const { session } = useAuth();
  const toast = useToast();
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [billRows, setBillRows] = useState<BillRow[]>([]);
  const [activeItems, setActiveItems] = useState<ItemOpt[]>([]);
  const [activeTotal, setActiveTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BillRow | null>(null);
  const [dischargeOpen, setDischargeOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session || !patientId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/patients/${patientId}`, { headers: { "x-actor-id": session.id } });
      const body = (await res.json()) as {
        error?: string;
        patient?: PatientRow;
        billable_items?: BillRow[];
        active_items?: ItemOpt[];
        active_total?: number;
      };
      if (!res.ok || !body.patient) {
        setError(body.error ?? "Could not load patient");
        toast.error(body.error ?? "Could not load patient");
        return;
      }
      setPatient(body.patient);
      setBillRows((body.billable_items ?? []) as BillRow[]);
      setActiveItems((body.active_items ?? []) as ItemOpt[]);
      setActiveTotal(Number(body.active_total ?? 0));
    } catch {
      setError("Could not load patient");
      toast.error("Could not load patient");
    } finally {
      setLoading(false);
    }
  }, [session, patientId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dischargeAllowed = useMemo(
    () => Boolean(session && ["ceo", "ops"].includes(session.role) && patient?.status === "active"),
    [session, patient],
  );

  if (!session) return null;
  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (error || !patient) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700 shadow-sm">
        {error || "Not found"}
      </div>
    );
  }

  const activeRows = billRows.filter((r) => r.status === "active");

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <Link href="/dashboard/patients" className="text-xs font-medium text-[#2563EB] underline">
          ← Patients
        </Link>
        {dischargeAllowed ? (
          <button
            type="button"
            onClick={() => setDischargeOpen(true)}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
          >
            Discharge Patient
          </button>
        ) : null}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs text-slate-500">{patient.uhid}</p>
            <h1 className="text-xl font-semibold text-slate-900">{patient.full_name}</h1>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
              patient.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
            }`}
          >
            {patient.status === "active" ? "Active" : "Discharged"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
          <p>Age: {patient.age ?? "—"}</p>
          <p>Gender: {patient.gender ?? "—"}</p>
          <p>Phone: {patient.phone ?? "—"}</p>
          <p>Type: {patient.admission_type.toUpperCase()}</p>
          <p>Bed: {patient.bed_number ?? "—"}</p>
          <p>Admission: {formatDate(patient.admission_date)}</p>
          <p className="col-span-2">Discharge: {formatDate(patient.discharge_date)}</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Running Bill</h2>
          {patient.status === "active" ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Add Item
            </button>
          ) : null}
        </div>

        <ul className="space-y-2">
          {billRows.map((row) => (
            <li key={row.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{row.item_name}</p>
                  <p className="text-xs text-slate-500">
                    Qty {row.quantity} × {formatInr(Number(row.unit_price))}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                    row.status === "active" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {row.status}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-600">
                  By {row.billed_by_name} · {formatDate(row.billed_at)}
                </span>
                <span className={`font-semibold ${row.status === "cancelled" ? "text-red-600 line-through" : "text-slate-900"}`}>
                  {formatInr(Number(row.total_price))}
                </span>
              </div>

              {row.note ? <p className="mt-1 text-xs text-slate-600">Note: {row.note}</p> : null}
              {row.cancel_reason ? <p className="mt-1 text-xs text-red-600">Cancelled: {row.cancel_reason}</p> : null}
              {row.can_cancel && row.status === "active" ? (
                <button
                  type="button"
                  onClick={() => setCancelTarget(row)}
                  className="mt-2 rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700"
                >
                  Cancel
                </button>
              ) : null}
            </li>
          ))}
          {billRows.length === 0 ? <p className="text-sm text-slate-500">No billable items yet.</p> : null}
        </ul>

        <div className="mt-3 border-t border-slate-100 pt-3 text-right">
          <p className="text-xs text-slate-500">Running Total (active items)</p>
          <p className="text-lg font-semibold text-slate-900">{formatInr(Number(activeTotal))}</p>
        </div>
      </section>

      {addOpen ? (
        <AddBillItemSheet
          sessionId={session.id}
          patientId={patient.id}
          items={activeItems}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            void load();
          }}
        />
      ) : null}

      {cancelTarget ? (
        <CancelBillItemSheet
          sessionId={session.id}
          patientId={patient.id}
          row={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onSaved={() => {
            setCancelTarget(null);
            void load();
          }}
        />
      ) : null}

      {dischargeOpen ? (
        <DischargeSheet
          sessionId={session.id}
          patientId={patient.id}
          rows={activeRows}
          total={activeTotal}
          onClose={() => setDischargeOpen(false)}
          onSaved={() => {
            setDischargeOpen(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function AddBillItemSheet({
  sessionId,
  patientId,
  items,
  onClose,
  onSaved,
}: {
  sessionId: string;
  patientId: string;
  items: ItemOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const selected = items.find((i) => i.id === itemId);
    if (selected) setUnitPrice(String(selected.price));
  }, [itemId, items]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/billable-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({
          item_id: itemId,
          quantity: Number(quantity),
          unit_price: Number(unitPrice),
          note: note.trim() || null,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not save");
        toast.error(body.error ?? "Could not save");
        return;
      }
      toast.success("Item added");
      onSaved();
    } catch {
      setError("Could not save");
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" onClick={onClose} aria-label="Close" />
      <div className="mx-auto max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h3 className="text-lg font-semibold text-[#2563EB]">Add Billable Item</h3>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            >
              <option value="">Select item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Quantity</label>
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Unit Price (INR)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !itemId}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CancelBillItemSheet({
  sessionId,
  patientId,
  row,
  onClose,
  onSaved,
}: {
  sessionId: string;
  patientId: string;
  row: BillRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!remarks.trim()) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/billable-items/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ action: "cancel", remarks: remarks.trim() }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not cancel");
        toast.error(body.error ?? "Could not cancel");
        return;
      }
      toast.warning("Billable item cancelled");
      onSaved();
    } catch {
      setError("Could not cancel");
      toast.error("Could not cancel");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" onClick={onClose} aria-label="Close" />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h3 className="text-lg font-semibold text-red-700">Cancel Billable Item</h3>
        <p className="mt-1 text-sm text-slate-600">{row.item_name}</p>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            required
            placeholder="Cancellation remarks (required)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-red-500 focus:ring-2"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !remarks.trim()}
            className="w-full rounded-lg bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Cancelling..." : "Confirm Cancel"}
          </button>
        </form>
      </div>
    </div>
  );
}

function DischargeSheet({
  sessionId,
  patientId,
  rows,
  total,
  onClose,
  onSaved,
}: {
  sessionId: string;
  patientId: string;
  rows: BillRow[];
  total: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function onConfirm() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/patients/${patientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ action: "discharge" }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not discharge");
        toast.error(body.error ?? "Could not discharge");
        return;
      }
      toast.success("Patient discharged");
      onSaved();
    } catch {
      setError("Could not discharge");
      toast.error("Could not discharge");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" onClick={onClose} aria-label="Close" />
      <div className="mx-auto max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h3 className="text-lg font-semibold text-[#2563EB]">Discharge Summary</h3>
        <p className="mt-1 text-xs text-slate-500">Active billable items only</p>
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between">
              <span>
                {r.item_name} × {r.quantity}
              </span>
              <span className="font-semibold">{formatInr(Number(r.total_price))}</span>
            </li>
          ))}
          {rows.length === 0 ? <li className="text-slate-500">No active items.</li> : null}
        </ul>
        <p className="mt-3 border-t border-slate-100 pt-3 text-right text-lg font-semibold">{formatInr(total)}</p>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={() => void onConfirm()}
          disabled={saving}
          className="mt-4 w-full rounded-lg bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Discharging..." : "Confirm Discharge"}
        </button>
      </div>
    </div>
  );
}
