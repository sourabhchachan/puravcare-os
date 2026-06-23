"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type InventoryItem = {
  item_id: string;
  item_name: string;
  current_stock: number;
  min_stock_threshold: number | null;
  is_low_stock: boolean;
};

type HistoryRow = {
  id: string;
  date: string;
  transaction_type: string;
  quantity: number;
  batch_number: string | null;
  invoice_number: string | null;
  added_by_name: string;
};

type SortId = "az" | "za" | "stock_low" | "stock_high";

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function typeLabel(t: string) {
  return t === "stock_in" ? "Stock in" : t === "stock_out" ? "Stock out" : t.replace(/_/g, " ");
}

export default function InventoryPage() {
  const { session, loading: authLoading } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("az");
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [stockInOpen, setStockInOpen] = useState(false);

  const isCeoOrOps = session?.role === "ceo" || session?.role === "ops";
  const isVendor = session?.role === "vendor";
  const canAccess = isCeoOrOps || isVendor;

  const load = useCallback(async () => {
    if (!session || !canAccess) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/inventory", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { items?: InventoryItem[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load inventory");
        toast.error(data.error ?? "Could not load inventory");
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setError("Could not load inventory");
      toast.error("Could not load inventory");
    } finally {
      setLoading(false);
    }
  }, [session, canAccess, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? items.filter((i) => i.item_name.toLowerCase().includes(q)) : [...items];
    list = [...list].sort((a, b) => {
      if (sort === "az") return a.item_name.localeCompare(b.item_name, undefined, { sensitivity: "base" });
      if (sort === "za") return b.item_name.localeCompare(a.item_name, undefined, { sensitivity: "base" });
      if (sort === "stock_low") return a.current_stock - b.current_stock;
      return b.current_stock - a.current_stock;
    });
    return list;
  }, [items, search, sort]);

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

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">
            {isVendor ? "Your tracked items and stock-in" : "Pharmacy stock levels"}
          </p>
        </div>
        {isVendor ? (
          <button
            type="button"
            onClick={() => setStockInOpen(true)}
            className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
          >
            Add Stock
          </button>
        ) : null}
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by item name…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "az" as const, label: "A–Z" },
            { id: "za" as const, label: "Z–A" },
            { id: "stock_low" as const, label: "Lowest Stock" },
            { id: "stock_high" as const, label: "Highest Stock" },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSort(s.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              sort === s.id ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {displayed.map((row) => (
            <li key={row.item_id}>
              <button
                type="button"
                onClick={() => isCeoOrOps && setHistoryItem(row)}
                className={`w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm ${
                  isCeoOrOps ? "transition hover:border-[#2563EB]/40" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{row.item_name}</p>
                  {row.is_low_stock ? (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                      Low Stock
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  Current stock: <span className="font-semibold">{row.current_stock}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Min threshold: {row.min_stock_threshold != null ? row.min_stock_threshold : "—"}
                </p>
                {isCeoOrOps ? (
                  <p className="mt-2 text-xs font-medium text-[#2563EB]">View history →</p>
                ) : null}
              </button>
            </li>
          ))}
          {displayed.length === 0 ? (
            <p className="text-sm text-slate-500">{items.length === 0 ? "No tracked items." : "No items match."}</p>
          ) : null}
        </ul>
      )}

      {historyItem && session && isCeoOrOps ? (
        <HistorySheet
          sessionId={session.id}
          item={historyItem}
          onClose={() => setHistoryItem(null)}
        />
      ) : null}

      {stockInOpen && session && isVendor ? (
        <StockInSheet
          sessionId={session.id}
          items={items}
          onClose={() => setStockInOpen(false)}
          onSaved={() => {
            setStockInOpen(false);
            toast.success("Stock added");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function HistorySheet({
  sessionId,
  item,
  onClose,
}: {
  sessionId: string;
  item: InventoryItem;
  onClose: () => void;
}) {
  const toast = useToast();
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/inventory/${item.item_id}`, { headers: { "x-actor-id": sessionId } });
        const data = (await res.json()) as { history?: HistoryRow[]; error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "Could not load history");
          return;
        }
        if (!cancelled) setHistory(data.history ?? []);
      } catch {
        toast.error("Could not load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.item_id, sessionId, toast]);

  function exportExcel() {
    try {
      if (!history.length) {
        toast.warning("No history to export");
        return;
      }
      const rows = history.map((h) => ({
        Date: formatDt(h.date),
        Type: typeLabel(h.transaction_type),
        Quantity: h.quantity,
        "Batch number": h.batch_number ?? "",
        "Invoice number": h.invoice_number ?? "",
        "Added by": h.added_by_name,
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "History");
      const slug = item.item_name.replace(/[^\w]+/g, "-").slice(0, 40);
      XLSX.writeFile(wb, `inventory-${slug}.xlsx`);
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[85vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[#2563EB]">{item.item_name}</h2>
            <p className="text-xs text-slate-500">Stock: {item.current_stock}</p>
          </div>
          <button
            type="button"
            onClick={() => exportExcel()}
            className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-[#2563EB]"
          >
            Export Excel
          </button>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="text-xs text-slate-500">{formatDt(h.date)}</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {typeLabel(h.transaction_type)} · Qty {h.quantity}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Batch: {h.batch_number ?? "—"} · Invoice: {h.invoice_number ?? "—"}
                </p>
                <p className="mt-1 text-xs text-slate-600">By: {h.added_by_name}</p>
              </li>
            ))}
            {history.length === 0 ? <p className="text-sm text-slate-500">No transactions yet.</p> : null}
          </ul>
        )}
      </div>
    </div>
  );
}

function StockInSheet({
  sessionId,
  items,
  onClose,
  onSaved,
}: {
  sessionId: string;
  items: InventoryItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [itemId, setItemId] = useState(items[0]?.item_id ?? "");
  const [quantity, setQuantity] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const qty = Number(quantity);
    const price = Number(purchasePrice);
    if (!itemId) {
      setError("Select an item.");
      toast.error("Select an item.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Enter a valid quantity.");
      toast.error("Enter a valid quantity.");
      return;
    }
    if (!batchNumber.trim()) {
      setError("Batch number is required.");
      toast.error("Batch number is required.");
      return;
    }
    if (!expiryDate) {
      setError("Expiry date is required.");
      toast.error("Expiry date is required.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid purchase price.");
      toast.error("Enter a valid purchase price.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setError("Invoice number is required.");
      toast.error("Invoice number is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({
          item_id: itemId,
          quantity: qty,
          batch_number: batchNumber.trim(),
          expiry_date: expiryDate,
          purchase_price: price,
          invoice_number: invoiceNumber.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const msg =
          data.error === "item_not_for_vendor"
            ? "This item is not mapped to your vendor account"
            : data.error === "inventory_not_tracked"
              ? "Inventory tracking is not enabled for this item"
              : data.error ?? "Could not add stock";
        setError(msg);
        toast.error(msg);
        return;
      }
      onSaved();
    } catch {
      setError("Could not add stock");
      toast.error("Could not add stock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Add stock</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Select item</option>
              {items.map((i) => (
                <option key={i.item_id} value={i.item_id}>
                  {i.item_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Quantity</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Batch number</label>
            <input
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Expiry date</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Purchase price (₹)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Invoice number</label>
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || items.length === 0}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Submit stock-in"}
          </button>
        </form>
      </div>
    </div>
  );
}
