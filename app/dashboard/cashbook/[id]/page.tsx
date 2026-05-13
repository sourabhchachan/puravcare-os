"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";
import { downloadExcelResponse } from "@/lib/dashboard/downloadExcel";

type EntryRow = {
  id: string;
  entry_type: string;
  amount: number;
  description: string | null;
  entry_date: string;
  created_by: string;
  created_by_name: string;
  category_id?: string | null;
  payment_method_id?: string | null;
  customer_id?: string | null;
  category_name?: string | null;
  payment_method_name?: string | null;
  customer_name?: string | null;
  custom_fields?: Record<string, string | number>;
};

type MemberRow = { user_id: string; full_name: string; role: string };
type CashbookField = {
  id: string;
  field_name: string;
  field_type: "text" | "number" | "date";
  is_required: boolean;
  display_order: number;
};

type DetailPayload = {
  cashbook: { id: string; name: string; description: string | null };
  balance: number | null;
  role: string;
  can_manage_members: boolean;
  can_edit_any_entry: boolean;
  can_edit_own: boolean;
  can_backdate: string;
  entries: EntryRow[];
  members: MemberRow[];
  directory_users?: { id: string; full_name: string; role: string }[];
  cashbook_fields?: CashbookField[];
};

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

function balanceClass(n: number) {
  if (n > 0) return "text-emerald-600";
  if (n < 0) return "text-red-600";
  return "text-slate-600";
}

function formatEntryDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeThisMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function rangeLastMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function rangeThisYear() {
  const y = new Date().getFullYear();
  const start = new Date(y, 0, 1);
  const end = new Date(y, 11, 31, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function CashbookDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { session, loading: authLoading } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<EntryRow | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session || !id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/cashbooks/${id}`, { headers: { "x-actor-id": session.id } });
      const body = (await res.json()) as DetailPayload & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not load");
        toast.error(body.error ?? "Could not load");
        setData(null);
        return;
      }
      setData(body);
    } catch {
      setError("Could not load");
      toast.error("Could not load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [session, id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadExport(startIso: string, endIso: string) {
    if (!session) return;
    const qs = new URLSearchParams({ start: startIso, end: endIso });
    const res = await fetch(`/api/cashbooks/${id}/export?${qs}`, { headers: { "x-actor-id": session.id } });
    if (!res.ok) {
      toast.error("Export failed");
      return;
    }
    await downloadExcelResponse(res, "cashbook.xlsx");
    toast.success("Export downloaded");
    setExportOpen(false);
  }

  if (authLoading || !session) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700 shadow-sm">
        {error || "Not found"}
        <div className="mt-3">
          <Link href="/dashboard/cashbook" className="font-medium text-[#2563EB] underline">
            Back to cashbooks
          </Link>
        </div>
      </div>
    );
  }

  const bal = data.balance;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/dashboard/cashbook" className="text-xs font-medium text-[#2563EB] underline">
            ← Cashbooks
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{data.cashbook.name}</h1>
          {data.cashbook.description ? <p className="text-sm text-slate-500">{data.cashbook.description}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Export
          </button>
          <div className="flex items-center gap-2">
            {session.role === "ceo" ? (
              <button
                type="button"
                onClick={() => setFieldsOpen(true)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Fields
              </button>
            ) : null}
            {data.can_manage_members ? (
              <button
                type="button"
                onClick={() => setMembersOpen(true)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Members
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Running balance</p>
        {bal === null ? (
          <p className="mt-1 text-2xl font-semibold text-slate-400">—</p>
        ) : (
          <p className={`mt-1 text-3xl font-bold ${balanceClass(bal)}`}>{formatInr(bal)}</p>
        )}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="mt-4 w-full rounded-lg bg-[#2563EB] py-2.5 text-sm font-semibold text-white"
        >
          Add entry
        </button>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Entries</h2>
        <ul className="space-y-2">
          {data.entries.map((e) => {
            const canEdit = data.can_edit_any_entry || (data.can_edit_own && e.created_by === session.id);
            return (
              <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500">{formatEntryDate(e.entry_date)}</span>
                  {canEdit ? (
                    <button type="button" className="text-xs font-medium text-[#2563EB]" onClick={() => setEditEntry(e)}>
                      Edit
                    </button>
                  ) : null}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-700">
                  <span>{e.category_name ?? "—"}</span>
                  <span className="text-slate-300"> | </span>
                  <span>{e.payment_method_name ?? "—"}</span>
                  <span className="text-slate-300"> | </span>
                  <span>{e.customer_name ?? "—"}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    {e.entry_type === "in" ? <span className="font-semibold text-emerald-600">{formatInr(Number(e.amount))} IN</span> : null}
                    {e.entry_type === "out" ? <span className="font-semibold text-red-600">{formatInr(Number(e.amount))} OUT</span> : null}
                  </span>
                  <span className="text-xs text-slate-500">{e.created_by_name}</span>
                </div>
                {e.description ? <p className="mt-1 text-xs text-slate-500">{e.description}</p> : null}
              </li>
            );
          })}
          {data.entries.length === 0 ? <p className="text-sm text-slate-500">No entries yet.</p> : null}
        </ul>
      </div>

      {addOpen ? (
        <EntrySheet
          mode="add"
          sessionId={session.id}
          cashbookId={id}
          canBackdate={data.can_backdate}
          isCashbookMember={data.role === "ceo" || Boolean(data.role)}
          customFieldDefs={data.cashbook_fields ?? []}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            toast.success("Entry saved");
            void load();
          }}
        />
      ) : null}

      {editEntry ? (
        <EntrySheet
          mode="edit"
          sessionId={session.id}
          cashbookId={id}
          canBackdate={data.can_backdate}
          isCashbookMember={data.role === "ceo" || Boolean(data.role)}
          customFieldDefs={data.cashbook_fields ?? []}
          initial={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => {
            setEditEntry(null);
            toast.success("Entry updated");
            void load();
          }}
        />
      ) : null}

      {membersOpen && data.can_manage_members ? (
        <MembersSheet
          sessionId={session.id}
          cashbookId={id}
          members={data.members}
          directory={data.directory_users ?? []}
          onClose={() => setMembersOpen(false)}
          onSaved={() => {
            void load();
          }}
        />
      ) : null}

      {fieldsOpen && session.role === "ceo" ? (
        <FieldsSheet
          sessionId={session.id}
          cashbookId={id}
          fields={data.cashbook_fields ?? []}
          onClose={() => setFieldsOpen(false)}
          onSaved={() => {
            void load();
          }}
        />
      ) : null}

      {exportOpen ? (
        <ExportSheet
          onClose={() => setExportOpen(false)}
          onPick={(preset) => {
            const r =
              preset === "this_month" ? rangeThisMonth() : preset === "last_month" ? rangeLastMonth() : rangeThisYear();
            void downloadExport(r.start, r.end);
          }}
          onCustom={(from, to) => {
            const s = new Date(from + "T00:00:00").toISOString();
            const e = new Date(to + "T23:59:59").toISOString();
            void downloadExport(s, e);
          }}
        />
      ) : null}
    </div>
  );
}

type MasterOpt = { id: string; name: string };

function mergeMasterOptions(active: MasterOpt[], selectedId: string | null | undefined, selectedName: string | null | undefined): MasterOpt[] {
  if (!selectedId) return active;
  if (active.some((o) => o.id === selectedId)) return active;
  return sortMasterOpts([...active, { id: selectedId, name: selectedName?.trim() ? selectedName : "(inactive)" }]);
}

function sortMasterOpts(opts: MasterOpt[]) {
  return [...opts].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function EntrySheet({
  mode,
  sessionId,
  cashbookId,
  canBackdate,
  isCashbookMember,
  customFieldDefs,
  initial,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  sessionId: string;
  cashbookId: string;
  canBackdate: string;
  isCashbookMember: boolean;
  customFieldDefs: CashbookField[];
  initial?: EntryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const canQuickCustomer = isCashbookMember;
  const [entryType, setEntryType] = useState<"in" | "out">((initial?.entry_type as "in" | "out") ?? "in");
  const [amount, setAmount] = useState(initial != null ? String(initial.amount) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [entryDate, setEntryDate] = useState(() => {
    if (initial?.entry_date) return ymd(new Date(initial.entry_date));
    return ymd(new Date());
  });
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [paymentMethodId, setPaymentMethodId] = useState(initial?.payment_method_id ?? "");
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [categories, setCategories] = useState<MasterOpt[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<MasterOpt[]>([]);
  const [customers, setCustomers] = useState<MasterOpt[]>([]);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [customValues, setCustomValues] = useState<Record<string, string>>(() => {
    const raw = initial?.custom_fields ?? {};
    const mapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) mapped[k] = String(v ?? "");
    return mapped;
  });

  const loadMasters = useCallback(async () => {
    setMastersLoading(true);
    try {
      const h = { "x-actor-id": sessionId };
      const [cRes, pRes, uRes] = await Promise.all([
        fetch("/api/cashbook-categories?active_only=1", { headers: h }),
        fetch("/api/payment-methods?active_only=1", { headers: h }),
        fetch("/api/customers?active_only=1", { headers: h }),
      ]);
      const [cJson, pJson, uJson] = await Promise.all([cRes.json(), pRes.json(), uRes.json()]);
      if (cRes.ok) {
        const list = (cJson as { categories?: { id: string; name: string }[] }).categories ?? [];
        setCategories(sortMasterOpts(list.map((x) => ({ id: x.id, name: x.name }))));
      }
      if (pRes.ok) {
        const list = (pJson as { payment_methods?: { id: string; name: string }[] }).payment_methods ?? [];
        setPaymentMethods(sortMasterOpts(list.map((x) => ({ id: x.id, name: x.name }))));
      }
      if (uRes.ok) {
        const list = (uJson as { customers?: { id: string; name: string }[] }).customers ?? [];
        setCustomers(sortMasterOpts(list.map((x) => ({ id: x.id, name: x.name }))));
      }
    } catch {
      toast.error("Could not load lists");
    } finally {
      setMastersLoading(false);
    }
  }, [sessionId, toast]);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  const categoryOptions = mergeMasterOptions(categories, initial?.category_id, initial?.category_name);
  const paymentMethodOptions = mergeMasterOptions(paymentMethods, initial?.payment_method_id, initial?.payment_method_name);
  const customerOptions = mergeMasterOptions(customers, initial?.customer_id, initial?.customer_name);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!categoryId || !paymentMethodId || !customerId) {
      setError("Select category, payment method, and customer.");
      toast.error("Select category, payment method, and customer.");
      return;
    }
    for (const field of customFieldDefs) {
      const v = (customValues[field.id] ?? "").trim();
      if (field.is_required && !v) {
        setError(`${field.field_name} is required.`);
        toast.error(`${field.field_name} is required.`);
        return;
      }
      if (field.field_type === "number" && v && Number.isNaN(Number(v))) {
        setError(`${field.field_name} must be a number.`);
        toast.error(`${field.field_name} must be a number.`);
        return;
      }
    }
    const customPayload: Record<string, string | number> = {};
    for (const field of customFieldDefs) {
      const v = (customValues[field.id] ?? "").trim();
      if (!v) continue;
      customPayload[field.id] = field.field_type === "number" ? Number(v) : v;
    }
    setSaving(true);
    try {
      const n = Number(amount);
      if (Number.isNaN(n) || n <= 0) {
        setError("Enter a valid amount.");
        toast.error("Enter a valid amount.");
        setSaving(false);
        return;
      }
      const desc = description.trim() || null;
      if (mode === "add") {
        const res = await fetch(`/api/cashbooks/${cashbookId}/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
          body: JSON.stringify({
            entry_type: entryType,
            amount: n,
            description: desc,
            entry_date: entryDate,
            category_id: categoryId,
            payment_method_id: paymentMethodId,
            customer_id: customerId,
            custom_fields: customPayload,
          }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(body.error ?? "Could not save");
          toast.error(body.error ?? "Could not save");
          return;
        }
      } else if (initial) {
        const res = await fetch(`/api/cashbooks/${cashbookId}/entries/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
          body: JSON.stringify({
            entry_type: entryType,
            amount: n,
            description: desc,
            entry_date: entryDate,
            category_id: categoryId,
            payment_method_id: paymentMethodId,
            customer_id: customerId,
            custom_fields: customPayload,
          }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(body.error ?? "Could not save");
          toast.error(body.error ?? "Could not save");
          return;
        }
      }
      onSaved();
    } catch {
      setError("Could not save");
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  }

  const dateHint =
    canBackdate === "never"
      ? "Date must be today (UTC calendar)."
      : canBackdate === "1day"
        ? "Today or yesterday (UTC calendar)."
        : "Any past date up to today.";

  const mastersReady = !mastersLoading;
  const refsOk = Boolean(categoryId && paymentMethodId && customerId);
  const disableSave = saving || !mastersReady || !refsOk;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">{mode === "add" ? "Add entry" : "Edit entry"}</h2>
        <p className="mt-1 text-xs text-slate-500">{dateHint}</p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              disabled={mastersLoading}
            >
              <option value="">Select category</option>
              {categoryOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Payment method</label>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              disabled={mastersLoading}
            >
              <option value="">Select payment method</option>
              {paymentMethodOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Customer</label>
            <div className="flex gap-2">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
                disabled={mastersLoading}
              >
                <option value="">Select customer</option>
                {customerOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {canQuickCustomer ? (
                <button
                  type="button"
                  onClick={() => setQuickCustomerOpen(true)}
                  className="shrink-0 rounded-lg border border-[#2563EB] px-3 py-2 text-sm font-semibold text-[#2563EB]"
                  aria-label="New customer"
                >
                  +
                </button>
              ) : null}
            </div>
          </div>
          {customFieldDefs.map((f) => (
            <div key={f.id}>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {f.field_name}
                {f.is_required ? " *" : ""}
              </label>
              <input
                type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                value={customValues[f.id] ?? ""}
                onChange={(e) => setCustomValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
                required={f.is_required}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${entryType === "in" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200"}`}
              onClick={() => setEntryType("in")}
            >
              IN
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${entryType === "out" ? "border-red-500 bg-red-50 text-red-800" : "border-slate-200"}`}
              onClick={() => setEntryType("out")}
            >
              OUT
            </button>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Amount</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              placeholder="Notes"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" disabled={disableSave} className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : mastersLoading ? "Loading…" : "Save"}
          </button>
        </form>
      </div>

      {quickCustomerOpen ? (
        <CustomerQuickSheet
          sessionId={sessionId}
          onClose={() => setQuickCustomerOpen(false)}
          onCreated={(id) => {
            setQuickCustomerOpen(false);
            void loadMasters().then(() => setCustomerId(id));
          }}
        />
      ) : null}
    </div>
  );
}

function CustomerQuickSheet({
  sessionId,
  onClose,
  onCreated,
}: {
  sessionId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json()) as { customer?: { id: string }; error?: string };
      if (!res.ok) {
        setErr(data.error === "duplicate_name" ? "Name already exists" : data.error ?? "Failed");
        toast.error(data.error === "duplicate_name" ? "Name already exists" : "Failed");
        return;
      }
      if (data.customer?.id) {
        toast.success("Customer added");
        onCreated(data.customer.id);
      }
    } catch {
      setErr("Failed");
      toast.error("Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <h3 className="text-base font-semibold text-[#2563EB]">New customer</h3>
        <form className="mt-3 space-y-3" onSubmit={submit}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Customer name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="flex-1 rounded-lg bg-[#2563EB] py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MembersSheet({
  sessionId,
  cashbookId,
  members,
  directory,
  onClose,
  onSaved,
}: {
  sessionId: string;
  cashbookId: string;
  members: MemberRow[];
  directory: { id: string; full_name: string; role: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"admin" | "data_operator">("admin");
  const [canBackdate, setCanBackdate] = useState<"always" | "never" | "1day">("never");
  const [canEditOwn, setCanEditOwn] = useState(false);
  const [hideBal, setHideBal] = useState(false);
  const [hideOthers, setHideOthers] = useState(false);
  const [error, setError] = useState("");

  async function addMember(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!userId) return;
    const res = await fetch(`/api/cashbooks/${cashbookId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
      body: JSON.stringify({
        user_id: userId,
        role,
        can_backdate: role === "data_operator" ? canBackdate : undefined,
        can_edit_own: role === "data_operator" ? canEditOwn : undefined,
        hide_balance: role === "data_operator" ? hideBal : undefined,
        hide_others_entries: role === "data_operator" ? hideOthers : undefined,
      }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Could not add");
      toast.error(body.error ?? "Could not add");
      return;
    }
    toast.success("Member added");
    setUserId("");
    onSaved();
  }

  async function removeMember(uid: string) {
    const res = await fetch(`/api/cashbooks/${cashbookId}/members?user_id=${encodeURIComponent(uid)}`, {
      method: "DELETE",
      headers: { "x-actor-id": sessionId },
    });
    if (!res.ok) {
      toast.error("Could not remove member");
      return;
    }
    toast.warning("Member removed");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Members</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between rounded-lg border border-slate-100 px-2 py-2">
              <span>
                {m.full_name} <span className="text-slate-500">({m.role})</span>
              </span>
              {m.role !== "primary_admin" ? (
                <button type="button" className="text-xs text-red-600" onClick={() => void removeMember(m.user_id)}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <form className="mt-4 space-y-2 border-t border-slate-100 pt-4" onSubmit={addMember}>
          <p className="text-xs font-semibold text-slate-600">Add member</p>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
            <option value="">Select user</option>
            {directory.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role})
              </option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
            <option value="admin">Admin</option>
            <option value="data_operator">Data operator</option>
          </select>
          {role === "data_operator" ? (
            <div className="space-y-2 text-xs">
              <select value={canBackdate} onChange={(e) => setCanBackdate(e.target.value as typeof canBackdate)} className="w-full rounded border px-2 py-1">
                <option value="always">Backdate: always</option>
                <option value="never">Backdate: never</option>
                <option value="1day">Backdate: 1 day</option>
              </select>
              <label className="flex justify-between">
                <span>Can edit own</span>
                <input type="checkbox" checked={canEditOwn} onChange={(e) => setCanEditOwn(e.target.checked)} />
              </label>
              <label className="flex justify-between">
                <span>Hide balance</span>
                <input type="checkbox" checked={hideBal} onChange={(e) => setHideBal(e.target.checked)} />
              </label>
              <label className="flex justify-between">
                <span>Hide others&apos; entries</span>
                <input type="checkbox" checked={hideOthers} onChange={(e) => setHideOthers(e.target.checked)} />
              </label>
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" className="w-full rounded-lg bg-[#2563EB] py-2 text-sm font-semibold text-white">
            Add
          </button>
        </form>
      </div>
    </div>
  );
}

function FieldsSheet({
  sessionId,
  cashbookId,
  fields,
  onClose,
  onSaved,
}: {
  sessionId: string;
  cashbookId: string;
  fields: CashbookField[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<"text" | "number" | "date">("text");
  const [isRequired, setIsRequired] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function addField(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!fieldName.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/cashbooks/${cashbookId}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
      body: JSON.stringify({
        field_name: fieldName.trim(),
        field_type: fieldType,
        is_required: isRequired,
        display_order: fields.length,
      }),
    });
    const body = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(body.error ?? "Could not add field");
      toast.error(body.error ?? "Could not add field");
      return;
    }
    setFieldName("");
    setFieldType("text");
    setIsRequired(false);
    toast.success("Field added");
    onSaved();
  }

  async function removeField(fieldId: string) {
    const res = await fetch(`/api/cashbooks/${cashbookId}/fields?field_id=${encodeURIComponent(fieldId)}`, {
      method: "DELETE",
      headers: { "x-actor-id": sessionId },
    });
    if (!res.ok) {
      toast.error("Could not remove field");
      return;
    }
    toast.warning("Field removed");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Fields</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {fields.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-2 py-2">
              <span>
                {f.field_name}{" "}
                <span className="text-slate-500">
                  ({f.field_type}
                  {f.is_required ? ", required" : ""})
                </span>
              </span>
              <button type="button" className="text-xs text-red-600" onClick={() => void removeField(f.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form className="mt-4 space-y-2 border-t border-slate-100 pt-4" onSubmit={addField}>
          <p className="text-xs font-semibold text-slate-600">Add field</p>
          <input
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
            placeholder="Field name"
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            required
          />
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value as typeof fieldType)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
          </select>
          <label className="flex justify-between text-xs">
            <span>Required</span>
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" disabled={saving} className="w-full rounded-lg bg-[#2563EB] py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Add"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ExportSheet({
  onClose,
  onPick,
  onCustom,
}: {
  onClose: () => void;
  onPick: (p: "this_month" | "last_month" | "this_year") => void;
  onCustom: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState(ymd(new Date()));
  const [to, setTo] = useState(ymd(new Date()));

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Export Excel</h2>
        <div className="mt-3 flex flex-col gap-2">
          <button type="button" className="rounded-lg border border-slate-200 py-2 text-sm" onClick={() => onPick("this_month")}>
            This month
          </button>
          <button type="button" className="rounded-lg border border-slate-200 py-2 text-sm" onClick={() => onPick("last_month")}>
            Last month
          </button>
          <button type="button" className="rounded-lg border border-slate-200 py-2 text-sm" onClick={() => onPick("this_year")}>
            This year
          </button>
        </div>
        <p className="mt-4 text-xs font-semibold text-slate-600">Custom range</p>
        <div className="mt-2 flex gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm" />
        </div>
        <button type="button" className="mt-3 w-full rounded-lg bg-[#2563EB] py-2 text-sm font-semibold text-white" onClick={() => onCustom(from, to)}>
          Download custom
        </button>
      </div>
    </div>
  );
}
