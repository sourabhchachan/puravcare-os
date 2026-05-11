"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type InvoiceItem = {
  id: string;
  invoice_id: string;
  indent_id: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  created_at?: string;
};

type Invoice = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  status: string;
  created_at: string;
  item_count: number;
  total_amount: number;
  items: InvoiceItem[];
};

function statusBadge(status: string) {
  if (status === "open") return "bg-yellow-100 text-yellow-900";
  if (status === "paid") return "bg-emerald-100 text-emerald-900";
  if (status === "cancelled") return "bg-red-100 text-red-900";
  return "bg-slate-100 text-slate-700";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatInr(n: number) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
  } catch {
    return String(n);
  }
}

function sheetName(id: string, idx: number) {
  return `Inv-${id.slice(0, 8)}-${idx + 1}`.slice(0, 31);
}

export default function InvoicesPage() {
  const { session, loading } = useAuth();
  const toast = useToast();
  const [loadingData, setLoadingData] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("date_newest");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!session) return;
      setLoadingData(true);
      setError("");
      try {
        const res = await fetch("/api/vendor-invoices", { headers: { "x-actor-id": session.id } });
        const data = (await res.json()) as { invoices?: Invoice[]; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not load invoices");
          toast.error(data.error ?? "Could not load invoices");
          return;
        }
        setInvoices(data.invoices ?? []);
      } catch {
        setError("Could not load invoices");
        toast.error("Could not load invoices");
      } finally {
        setLoadingData(false);
      }
    }
    void loadData();
  }, [session, toast]);

  const shownInvoices = useMemo(() => {
    const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    const filtered = invoices.filter((invoice) => {
      if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
      const createdTs = new Date(invoice.created_at).getTime();
      if (fromTs != null && createdTs < fromTs) return false;
      if (toTs != null && createdTs > toTs) return false;
      return true;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === "date_oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "vendor_az") return (a.vendor_name ?? "").localeCompare(b.vendor_name ?? "");
      if (sortBy === "amount_high") return b.total_amount - a.total_amount;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return sorted;
  }, [fromDate, invoices, sortBy, statusFilter, toDate]);

  const statusOptions = useMemo(() => {
    const values = [...new Set(invoices.map((invoice) => invoice.status).filter(Boolean))];
    return values.sort((a, b) => a.localeCompare(b));
  }, [invoices]);

  function downloadOne(invoice: Invoice) {
    try {
      const rows = invoice.items.map((item) => ({
        invoice_id: invoice.id,
        status: invoice.status,
        vendor: invoice.vendor_name,
        indent_id: item.indent_id ?? "",
        description: item.description ?? "",
        quantity: item.quantity ?? "",
        unit_price: item.unit_price ?? "",
        total_price: item.total_price ?? "",
        created_at: item.created_at ?? "",
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName(invoice.id, 0));
      XLSX.writeFile(wb, `invoice-${invoice.id}.xlsx`);
      toast.success("Invoice downloaded");
    } catch {
      toast.error("Could not download invoice");
    }
  }

  function downloadAll() {
    try {
      if (!shownInvoices.length) {
        toast.warning("No invoices to download");
        return;
      }
      const wb = XLSX.utils.book_new();
      shownInvoices.forEach((invoice, idx) => {
        const rows = invoice.items.map((item) => ({
          invoice_id: invoice.id,
          status: invoice.status,
          vendor: invoice.vendor_name,
          indent_id: item.indent_id ?? "",
          description: item.description ?? "",
          quantity: item.quantity ?? "",
          unit_price: item.unit_price ?? "",
          total_price: item.total_price ?? "",
          created_at: item.created_at ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, sheetName(invoice.id, idx));
      });
      XLSX.writeFile(wb, "vendor-invoices.xlsx");
      toast.success("All invoices downloaded");
    } catch {
      toast.error("Could not download all invoices");
    }
  }

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!["vendor", "ceo", "ops"].includes(session.role)) {
    return <p className="text-sm text-slate-600">Invoices are available for vendor, CEO, and ops roles.</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
        <button type="button" onClick={downloadAll} className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white">
          Download All
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="date_newest">Date: newest first</option>
          <option value="date_oldest">Date: oldest first</option>
          <option value="vendor_az">Vendor: A-Z</option>
          <option value="amount_high">Amount: high to low</option>
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loadingData ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loadingData && shownInvoices.length === 0 ? <p className="text-sm text-slate-500">No invoices found.</p> : null}

      <ul className="space-y-3">
        {shownInvoices.map((invoice) => (
          <li key={invoice.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">Invoice</p>
                <p className="font-semibold text-slate-900">{invoice.id}</p>
                <p className="text-xs text-slate-500">{formatDate(invoice.created_at)}</p>
              </div>
              <div className="text-right">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(invoice.status)}`}>{invoice.status}</span>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatInr(invoice.total_amount)}</p>
                <p className="text-xs text-slate-500">{invoice.item_count} items</p>
                {session.role !== "vendor" ? <p className="text-xs text-slate-500">Vendor: {invoice.vendor_name}</p> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === invoice.id ? null : invoice.id))}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {expandedId === invoice.id ? "Hide items" : "View items"}
              </button>
              <button
                type="button"
                onClick={() => downloadOne(invoice)}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
              >
                Download Excel
              </button>
            </div>

            {expandedId === invoice.id ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Unit Price</th>
                      <th className="px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.length === 0 ? (
                      <tr>
                        <td className="px-3 py-2 text-slate-500" colSpan={4}>
                          No items in this invoice.
                        </td>
                      </tr>
                    ) : (
                      invoice.items.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{item.description ?? "—"}</td>
                          <td className="px-3 py-2">{item.quantity ?? "—"}</td>
                          <td className="px-3 py-2">{item.unit_price != null ? formatInr(Number(item.unit_price)) : "—"}</td>
                          <td className="px-3 py-2">{item.total_price != null ? formatInr(Number(item.total_price)) : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
