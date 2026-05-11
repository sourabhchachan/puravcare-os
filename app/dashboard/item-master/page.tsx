"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type Vendor = { id: string; name: string };

type ItemRow = {
  id: string;
  name: string;
  price: number;
  vendor_id: string | null;
  vendor_name: string | null;
  is_patient_linked: boolean;
  is_active: boolean;
};

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export default function ItemMasterPage() {
  const { session, loading: authLoading } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<ItemRow | "new" | null>(null);

  const canAccess = session && (session.role === "ceo" || session.can_create_items === true);

  const load = useCallback(async () => {
    if (!session || !canAccess) return;
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const res = await fetch("/api/items", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { items?: ItemRow[]; vendors?: Vendor[]; error?: string };
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Could not load items");
        toast.error(data.error ?? "Could not load items");
        return;
      }
      setItems(data.items ?? []);
      setVendors(data.vendors ?? []);
    } catch {
      setError("Could not load items");
      toast.error("Could not load items");
    } finally {
      setLoading(false);
    }
  }, [session, canAccess, toast]);

  useEffect(() => {
    if (!session) return;
    if (!canAccess) {
      setLoading(false);
      return;
    }
    void load();
  }, [session, canAccess, load]);

  async function toggleActive(row: ItemRow, next: boolean) {
    if (!session) return;
    try {
      const res = await fetch(`/api/items/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": session.id },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) {
        toast.error("Could not update item");
        return;
      }
      toast.success(next ? "Item activated" : "Item deactivated");
      await load();
    } catch {
      toast.error("Could not update item");
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  if (authLoading || !session) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (!canAccess) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center text-red-700 shadow-sm">
        Access denied
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center text-red-700 shadow-sm">
        Access denied
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Item master</h1>
          <p className="text-sm text-slate-500">Billable items and vendor mapping</p>
        </div>
        <button
          type="button"
          onClick={() => setSheet("new")}
          className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
        >
          New Item
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSheet(row)}>
                <p className="truncate font-semibold text-slate-900">{row.name}</p>
                <p className="text-xs text-slate-600">
                  {formatInr(row.price)} · {row.vendor_name ?? "—"} · {row.is_patient_linked ? "Patient-linked" : "Not patient-linked"}
                </p>
              </button>
              <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-700">
                <span>Active</span>
                <input type="checkbox" checked={row.is_active} onChange={(e) => void toggleActive(row, e.target.checked)} />
              </label>
            </li>
          ))}
          {filtered.length === 0 ? <p className="text-sm text-slate-500">No items match.</p> : null}
        </ul>
      )}

      {sheet ? (
        <ItemSheet
          sessionId={session.id}
          vendors={vendors}
          initial={sheet === "new" ? null : sheet}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            toast.success("Item saved");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function ItemSheet({
  sessionId,
  vendors,
  initial,
  onClose,
  onSaved,
}: {
  sessionId: string;
  vendors: Vendor[];
  initial: ItemRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial != null ? String(initial.price) : "");
  const [vendorId, setVendorId] = useState(initial?.vendor_id ?? "");
  const [patientLinked, setPatientLinked] = useState(initial?.is_patient_linked ?? false);
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const priceNum = Number(price);
    if (!name.trim()) {
      setError("Name is required.");
      toast.error("Name is required.");
      return;
    }
    if (Number.isNaN(priceNum)) {
      setError("Enter a valid price.");
      toast.error("Enter a valid price.");
      return;
    }
    if (!vendorId) {
      setError("Vendor is required.");
      toast.error("Vendor is required.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        price: priceNum,
        vendor_id: vendorId,
        is_patient_linked: patientLinked,
        is_active: active,
      };

      const isNew = !initial;
      const res = isNew
        ? await fetch("/api/items", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/items/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
            body: JSON.stringify(body),
          });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (data.error === "duplicate_name") {
          setError("An item with this name already exists (same spelling, any case).");
          toast.error("Duplicate item name");
        } else {
          setError(data.error ?? "Could not save");
          toast.error(data.error ?? "Could not save");
        }
        return;
      }
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
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">{initial ? "Edit item" : "New item"}</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Price (₹)</label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Vendor</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Select vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span>Patient linked (requires patient to bill)</span>
            <input type="checkbox" checked={patientLinked} onChange={(e) => setPatientLinked(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span>Active</span>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
