"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  reason: string | null;
  batch_number: string | null;
  invoice_number: string | null;
  added_by_name: string;
};

type SortId = "az" | "za" | "stock_low" | "stock_high";

type BulkStockRow = {
  item_name: string;
  quantity: number;
  batch_number: string;
  expiry_date: string;
  purchase_price: number;
  invoice_number: string;
};

type ParsedBulkRow = BulkStockRow & {
  rowIndex: number;
  errors: string[];
};

const BULK_COLUMNS = [
  "item_name",
  "quantity",
  "batch_number",
  "expiry_date",
  "purchase_price",
  "invoice_number",
] as const;

function downloadStockInTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [...BULK_COLUMNS],
    ["Example Item", 10, "BATCH-001", "2026-12-31", 100, "INV-001"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock In");
  XLSX.writeFile(wb, "stock-in-template.xlsx");
}

function parseExpiryFromCell(val: unknown): string | null {
  if (val == null || val === "") return null;
  if (typeof val === "number" && XLSX.SSF?.parse_date_code) {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) return s;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function parseBulkExcel(
  file: ArrayBuffer,
  vendorItems: InventoryItem[]
): ParsedBulkRow[] {
  const wb = XLSX.read(file, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) return [];

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const nameSet = new Map(
    vendorItems.map((i) => [i.item_name.trim().toLowerCase(), i.item_name])
  );

  return raw.map((row, idx) => {
    const itemName = String(row.item_name ?? "").trim();
    const quantity = Number(row.quantity);
    const batchNumber = String(row.batch_number ?? "").trim();
    const expiryDate = parseExpiryFromCell(row.expiry_date) ?? "";
    const purchasePrice = Number(row.purchase_price);
    const invoiceNumber = String(row.invoice_number ?? "").trim();
    const errors: string[] = [];

    if (!itemName || !nameSet.has(itemName.toLowerCase())) {
      errors.push("Item name must match a tracked item mapped to your vendor");
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push("Quantity must be a positive number");
    }

    return {
      rowIndex: idx + 2,
      item_name: itemName,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      batch_number: batchNumber,
      expiry_date: expiryDate,
      purchase_price: Number.isFinite(purchasePrice) ? purchasePrice : 0,
      invoice_number: invoiceNumber,
      errors,
    };
  }).filter((row) =>
    row.item_name || row.batch_number || row.invoice_number || row.quantity > 0
  );
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function typeLabel(t: string) {
  if (t === "stock_in") return "Stock in";
  if (t === "stock_out") return "Stock out";
  if (t === "adjustment") return "Adjustment";
  return t.replace(/_/g, " ");
}

function formatQty(t: string, quantity: number) {
  if (t === "adjustment") {
    return quantity > 0 ? `+${quantity}` : String(quantity);
  }
  return String(quantity);
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
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [stockInOpen, setStockInOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  const isCeoOrOps = session?.role === "ceo" || session?.role === "ops";
  const isCeo = session?.role === "ceo";
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
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => downloadStockInTemplate()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#2563EB]"
            >
              Download Template
            </button>
            <button
              type="button"
              onClick={() => setBulkUploadOpen(true)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#2563EB]"
            >
              Upload Stock
            </button>
            <button
              type="button"
              onClick={() => setStockInOpen(true)}
              className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
            >
              Add Stock
            </button>
          </div>
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
              <div className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
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
                <div className="mt-3 flex flex-wrap gap-2">
                  {isCeoOrOps ? (
                    <button
                      type="button"
                      onClick={() => setHistoryItem(row)}
                      className="text-xs font-medium text-[#2563EB]"
                    >
                      View history →
                    </button>
                  ) : null}
                  {isCeo ? (
                    <button
                      type="button"
                      onClick={() => setAdjustItem(row)}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                    >
                      Adjust Stock
                    </button>
                  ) : null}
                </div>
              </div>
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

      {adjustItem && session && isCeo ? (
        <AdjustStockSheet
          sessionId={session.id}
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onSaved={() => {
            setAdjustItem(null);
            toast.success("Stock adjusted");
            void load();
          }}
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

      {bulkUploadOpen && session && isVendor ? (
        <BulkUploadSheet
          sessionId={session.id}
          items={items}
          onClose={() => setBulkUploadOpen(false)}
          onSaved={() => {
            setBulkUploadOpen(false);
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
        Quantity: formatQty(h.transaction_type, h.quantity),
        Reason: h.reason ?? "",
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
                  {typeLabel(h.transaction_type)} · Qty{" "}
                  <span
                    className={
                      h.transaction_type === "adjustment"
                        ? h.quantity > 0
                          ? "text-emerald-700"
                          : "text-red-700"
                        : ""
                    }
                  >
                    {formatQty(h.transaction_type, h.quantity)}
                  </span>
                </p>
                {h.transaction_type === "adjustment" && h.reason ? (
                  <p className="mt-1 text-xs text-slate-600">Reason: {h.reason}</p>
                ) : null}
                {h.transaction_type !== "adjustment" ? (
                  <p className="mt-1 text-xs text-slate-600">
                    Batch: {h.batch_number ?? "—"} · Invoice: {h.invoice_number ?? "—"}
                  </p>
                ) : null}
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

function AdjustStockSheet({
  sessionId,
  item,
  onClose,
  onSaved,
}: {
  sessionId: string;
  item: InventoryItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const qty = Number(quantity);
    const trimmedReason = reason.trim();

    if (!Number.isFinite(qty) || qty === 0) {
      setError("Enter a non-zero quantity (positive to add, negative to reduce).");
      toast.error("Enter a valid quantity.");
      return;
    }
    if (!trimmedReason) {
      setError("Reason is required.");
      toast.error("Reason is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({
          item_id: item.item_id,
          quantity: qty,
          reason: trimmedReason,
        }),
      });
      const data = (await res.json()) as { error?: string; current_stock?: number };
      if (!res.ok) {
        const msg = data.error ?? "Could not adjust stock";
        setError(msg);
        toast.error(msg);
        return;
      }
      onSaved();
    } catch {
      setError("Could not adjust stock");
      toast.error("Could not adjust stock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Adjust stock</h2>
        <p className="mt-1 text-sm text-slate-600">{item.item_name}</p>
        <p className="mt-1 text-xs text-slate-500">
          Current stock: <span className="font-semibold text-slate-800">{item.current_stock}</span>
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Quantity (positive to add, negative to reduce)
            </label>
            <input
              type="number"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              placeholder="Why is this adjustment needed?"
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Submit adjustment"}
          </button>
        </form>
      </div>
    </div>
  );
}

function BulkUploadSheet({
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
  const [parsedRows, setParsedRows] = useState<ParsedBulkRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    succeeded: number;
    failed: number;
    failures: { index: number; item_name: string; reason: string }[];
  } | null>(null);

  const validRows = useMemo(
    () => (parsedRows ?? []).filter((r) => r.errors.length === 0),
    [parsedRows]
  );
  const invalidRows = useMemo(
    () => (parsedRows ?? []).filter((r) => r.errors.length > 0),
    [parsedRows]
  );

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please upload an .xlsx file");
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const rows = parseBulkExcel(buffer, items);
      if (!rows.length) {
        toast.warning("No data rows found in the file");
        setParsedRows(null);
        setFileName("");
        return;
      }
      setParsedRows(rows);
      setFileName(file.name);
      setResult(null);
    } catch {
      toast.error("Could not parse Excel file");
      setParsedRows(null);
      setFileName("");
    }
  }

  async function handleConfirm() {
    if (!validRows.length) {
      toast.error("No valid rows to submit");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({
          rows: validRows.map((r) => ({
            item_name: r.item_name,
            quantity: r.quantity,
            batch_number: r.batch_number,
            expiry_date: r.expiry_date,
            purchase_price: r.purchase_price,
            invoice_number: r.invoice_number,
          })),
        }),
      });
      const data = (await res.json()) as {
        succeeded?: number;
        failed?: number;
        failures?: { index: number; item_name: string; reason: string }[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Bulk upload failed");
        return;
      }
      setResult({
        succeeded: data.succeeded ?? 0,
        failed: data.failed ?? 0,
        failures: data.failures ?? [],
      });
      if ((data.succeeded ?? 0) > 0) {
        toast.success(`${data.succeeded} row(s) added`);
        onSaved();
      }
      if ((data.failed ?? 0) > 0) {
        toast.warning(`${data.failed} row(s) failed`);
      }
    } catch {
      toast.error("Bulk upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Upload stock</h2>
        <p className="mt-1 text-xs text-slate-500">
          Upload an Excel file using the template columns.
        </p>

        <label className="mt-4 flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-center">
          <span className="text-sm font-semibold text-[#2563EB]">Choose .xlsx file</span>
          <span className="mt-1 text-xs text-slate-500">{fileName || "No file selected"}</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
        </label>

        {parsedRows ? (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-slate-600">
              {validRows.length} valid · {invalidRows.length} invalid
            </p>

            {validRows.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase text-green-700">Valid rows</h3>
                <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-green-200">
                  <table className="w-full text-left text-[10px]">
                    <thead className="bg-green-50 text-green-800">
                      <tr>
                        <th className="px-2 py-1">Row</th>
                        <th className="px-2 py-1">Item</th>
                        <th className="px-2 py-1">Qty</th>
                        <th className="px-2 py-1">Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.map((r) => (
                        <tr key={r.rowIndex} className="border-t border-green-100">
                          <td className="px-2 py-1">{r.rowIndex}</td>
                          <td className="px-2 py-1">{r.item_name}</td>
                          <td className="px-2 py-1">{r.quantity}</td>
                          <td className="px-2 py-1">{r.batch_number || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {invalidRows.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase text-red-700">Invalid rows</h3>
                <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-red-200">
                  <table className="w-full text-left text-[10px]">
                    <thead className="bg-red-50 text-red-800">
                      <tr>
                        <th className="px-2 py-1">Row</th>
                        <th className="px-2 py-1">Item</th>
                        <th className="px-2 py-1">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invalidRows.map((r) => (
                        <tr key={r.rowIndex} className="border-t border-red-100">
                          <td className="px-2 py-1">{r.rowIndex}</td>
                          <td className="px-2 py-1">{r.item_name || "—"}</td>
                          <td className="px-2 py-1 text-red-700">{r.errors.join("; ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {result ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p>
                  Submitted: <span className="font-semibold text-green-700">{result.succeeded}</span>{" "}
                  succeeded, <span className="font-semibold text-red-700">{result.failed}</span> failed
                </p>
                {result.failures.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {result.failures.map((f) => (
                      <li key={`${f.index}-${f.item_name}`}>
                        Row {f.index + 1}: {f.item_name} — {f.reason.replace(/_/g, " ")}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                disabled={submitting || validRows.length === 0}
                onClick={() => void handleConfirm()}
                className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Submitting…" : `Confirm upload (${validRows.length} rows)`}
              </button>
            )}
          </div>
        ) : null}
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
