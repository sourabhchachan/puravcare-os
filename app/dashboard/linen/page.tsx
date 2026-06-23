"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type StockRow = {
  item_id: string;
  item_name: string;
  in_store: number;
  in_use: number;
  in_laundry_bag: number;
  in_laundry: number;
  lost: number;
  damaged: number;
};

type TxnRow = {
  id: string;
  item_name: string;
  transaction_type: string;
  quantity: number;
  from_status: string | null;
  to_status: string;
  patient_name: string | null;
  location_name: string | null;
  invoice_number: string | null;
  created_by_name: string;
  created_at: string;
};

type FollowupRow = {
  id: string;
  item_name: string;
  quantity: number;
  source_type: string;
  created_at: string;
};

type PendingReturn = {
  id: string;
  item_name: string;
  quantity: number;
  patient_name: string | null;
  location_name: string | null;
};

type ItemOpt = { id: string; name: string };
type LocOpt = { id: string; name: string };

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function LinenPage() {
  const { session, loading: authLoading } = useAuth();
  const toast = useToast();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [transactions, setTransactions] = useState<TxnRow[]>([]);
  const [followups, setFollowups] = useState<FollowupRow[]>([]);
  const [items, setItems] = useState<ItemOpt[]>([]);
  const [pendingReturns, setPendingReturns] = useState<PendingReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isLinenVendor, setIsLinenVendor] = useState(false);
  const [txnFilter, setTxnFilter] = useState("");
  const [stockInOpen, setStockInOpen] = useState(false);
  const [laundrySendOpen, setLaundrySendOpen] = useState(false);
  const [laundryRecvOpen, setLaundryRecvOpen] = useState(false);
  const [returnRecvOpen, setReturnRecvOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<FollowupRow | null>(null);

  const isCeoOrOps = session?.role === "ceo" || session?.role === "ops";
  const canResolve = isCeoOrOps || isLinenVendor;

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setAccessDenied(false);
    try {
      if (session.role === "vendor") {
        const meRes = await fetch("/api/vendor", { headers: { "x-actor-id": session.id } });
        const meData = (await meRes.json()) as { vendor?: { category?: string } | null };
        const isLinen = (meData.vendor?.category ?? "").toLowerCase() === "linen_store";
        setIsLinenVendor(isLinen);
        if (!isLinen) {
          setAccessDenied(true);
          return;
        }
      } else if (session.role !== "ceo" && session.role !== "ops") {
        setAccessDenied(true);
        return;
      }

      const qs = txnFilter ? `?transaction_type=${encodeURIComponent(txnFilter)}` : "";
      const res = await fetch(`/api/linen${qs}`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as {
        stock?: StockRow[];
        transactions?: TxnRow[];
        followups?: FollowupRow[];
        items?: ItemOpt[];
        pending_returns?: PendingReturn[];
        error?: string;
      };
      if (!res.ok) {
        setAccessDenied(res.status === 403);
        toast.error(data.error ?? "Could not load");
        return;
      }
      setStock(data.stock ?? []);
      setTransactions(data.transactions ?? []);
      setFollowups(data.followups ?? []);
      setItems(data.items ?? []);
      setPendingReturns(data.pending_returns ?? []);
    } catch {
      toast.error("Could not load");
    } finally {
      setLoading(false);
    }
  }, [session, txnFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTxns = useMemo(() => transactions, [transactions]);

  function exportExcel() {
    if (!filteredTxns.length) {
      toast.warning("No transactions to export");
      return;
    }
    const rows = filteredTxns.map((t) => ({
      Date: formatDt(t.created_at),
      Item: t.item_name,
      Type: t.transaction_type,
      Quantity: t.quantity,
      From: t.from_status ?? "",
      To: t.to_status,
      Patient: t.patient_name ?? "",
      Location: t.location_name ?? "",
      Invoice: t.invoice_number ?? "",
      By: t.created_by_name,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Linen");
    XLSX.writeFile(wb, "linen-transactions.xlsx");
    toast.success("Export downloaded");
  }

  if (authLoading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (accessDenied) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center text-red-700 shadow-sm">
        Access denied
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Linen</h1>
          <p className="text-sm text-slate-500">
            {isLinenVendor ? "Linen store operations" : "Linen inventory overview"}
          </p>
        </div>
        {isLinenVendor ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setStockInOpen(true)} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white">
              Stock-in
            </button>
            <button type="button" onClick={() => setLaundrySendOpen(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
              Send to laundry
            </button>
            <button type="button" onClick={() => setLaundryRecvOpen(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
              Receive from laundry
            </button>
            <button type="button" onClick={() => setReturnRecvOpen(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
              Receive return
            </button>
          </div>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Stock levels</h2>
        <ul className="mt-3 space-y-3">
          {stock.map((s) => (
            <li key={s.item_id} className="rounded-lg border border-slate-100 p-3 text-xs">
              <p className="font-semibold text-slate-900">{s.item_name}</p>
              <div className="mt-2 grid grid-cols-3 gap-1 text-slate-600">
                <span>In store: <b>{s.in_store}</b></span>
                <span>In use: <b>{s.in_use}</b></span>
                <span>Laundry bag: <b>{s.in_laundry_bag}</b></span>
                <span>In laundry: <b>{s.in_laundry}</b></span>
                <span>Lost: <b className="text-red-600">{s.lost}</b></span>
                <span>Damaged: <b className="text-orange-600">{s.damaged}</b></span>
              </div>
            </li>
          ))}
          {stock.length === 0 && !loading ? <p className="text-sm text-slate-500">No linen items tracked.</p> : null}
        </ul>
      </section>

      {followups.length > 0 ? (
        <section className="rounded-xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-orange-900">Open follow-ups</h2>
          <ul className="mt-2 space-y-2">
            {followups.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2 text-xs">
                <span>
                  {f.item_name} · Qty {f.quantity} · {f.source_type}
                </span>
                {canResolve ? (
                  <button type="button" className="font-semibold text-[#2563EB]" onClick={() => setResolveTarget(f)}>
                    Resolve
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Transaction history</h2>
          {isCeoOrOps ? (
            <button type="button" onClick={exportExcel} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-[#2563EB]">
              Export Excel
            </button>
          ) : null}
        </div>
        {isCeoOrOps ? (
          <select
            value={txnFilter}
            onChange={(e) => setTxnFilter(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          >
            <option value="">All types</option>
            <option value="stock_in">Stock in</option>
            <option value="issued">Issued</option>
            <option value="return_good">Return good</option>
            <option value="return_damaged">Return damaged</option>
            <option value="return_lost">Return lost</option>
            <option value="laundry_send">Laundry send</option>
            <option value="laundry_receive">Laundry receive</option>
            <option value="laundry_lost">Laundry lost</option>
          </select>
        ) : null}
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {filteredTxns.map((t) => (
            <li key={t.id} className="rounded-lg border border-slate-100 p-2 text-xs">
              <p className="text-slate-500">{formatDt(t.created_at)}</p>
              <p className="font-semibold text-slate-900">
                {t.item_name} · {t.transaction_type} · Qty {t.quantity}
              </p>
              <p className="text-slate-600">
                {t.from_status ?? "—"} → {t.to_status}
                {t.patient_name ? ` · Patient: ${t.patient_name}` : ""}
                {t.location_name ? ` · Location: ${t.location_name}` : ""}
              </p>
            </li>
          ))}
          {filteredTxns.length === 0 ? <p className="text-sm text-slate-500">No transactions.</p> : null}
        </ul>
      </section>

      {stockInOpen && session ? (
        <StockInSheet sessionId={session.id} items={items} onClose={() => setStockInOpen(false)} onSaved={() => { setStockInOpen(false); toast.success("Stock added"); void load(); }} />
      ) : null}
      {laundrySendOpen && session ? (
        <SimpleQtySheet title="Send to laundry" sessionId={session.id} items={items} onClose={() => setLaundrySendOpen(false)} onSubmit={async (itemId, qty) => {
          const res = await fetch("/api/linen/laundry", { method: "POST", headers: { "Content-Type": "application/json", "x-actor-id": session.id }, body: JSON.stringify({ action: "send", item_id: itemId, quantity: qty }) });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) { toast.error(data.error ?? "Failed"); return false; }
          toast.success("Sent to laundry"); void load(); return true;
        }} />
      ) : null}
      {laundryRecvOpen && session ? (
        <LaundryReceiveSheet sessionId={session.id} items={items} onClose={() => setLaundryRecvOpen(false)} onSaved={() => { setLaundryRecvOpen(false); toast.success("Laundry received"); void load(); }} />
      ) : null}
      {returnRecvOpen && session ? (
        <ReturnReceiveSheet sessionId={session.id} returns={pendingReturns} onClose={() => setReturnRecvOpen(false)} onSaved={() => { setReturnRecvOpen(false); toast.success("Return processed"); void load(); }} />
      ) : null}
      {resolveTarget && session ? (
        <ResolveFollowupSheet sessionId={session.id} followup={resolveTarget} onClose={() => setResolveTarget(null)} onSaved={() => { setResolveTarget(null); toast.success("Follow-up resolved"); void load(); }} />
      ) : null}
    </div>
  );
}

function StockInSheet({ sessionId, items, onClose, onSaved }: { sessionId: string; items: ItemOpt[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [invoice, setInvoice] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/linen", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ item_id: itemId, quantity: Number(quantity), invoice_number: invoice.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Stock-in" onClose={onClose}>
      <form className="space-y-3" onSubmit={onSubmit}>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input type="number" min={0} step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Quantity" className="w-full rounded-lg border px-3 py-2 text-sm" required />
        <input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Invoice number" className="w-full rounded-lg border px-3 py-2 text-sm" required />
        <button type="submit" disabled={saving} className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Submit"}</button>
      </form>
    </Sheet>
  );
}

function SimpleQtySheet({ title, sessionId, items, onClose, onSubmit }: { title: string; sessionId: string; items: ItemOpt[]; onClose: () => void; onSubmit: (itemId: string, qty: number) => Promise<boolean> }) {
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await onSubmit(itemId, Number(quantity));
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <form className="space-y-3" onSubmit={handle}>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input type="number" min={0} step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Quantity" className="w-full rounded-lg border px-3 py-2 text-sm" required />
        <button type="submit" disabled={saving} className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Submit"}</button>
      </form>
    </Sheet>
  );
}

function LaundryReceiveSheet({ sessionId, items, onClose, onSaved }: { sessionId: string; items: ItemOpt[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [sent, setSent] = useState("");
  const [returned, setReturned] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/linen/laundry", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ action: "receive", item_id: itemId, quantity_sent: Number(sent), quantity_returned: Number(returned) }),
      });
      const data = (await res.json()) as { error?: string; shortage?: number };
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      if ((data.shortage ?? 0) > 0) toast.warning(`Shortage ${data.shortage} — follow-up created`);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Receive from laundry" onClose={onClose}>
      <form className="space-y-3" onSubmit={onSubmit}>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input type="number" min={0} step="0.01" value={sent} onChange={(e) => setSent(e.target.value)} placeholder="Quantity sent" className="w-full rounded-lg border px-3 py-2 text-sm" required />
        <input type="number" min={0} step="0.01" value={returned} onChange={(e) => setReturned(e.target.value)} placeholder="Quantity returned" className="w-full rounded-lg border px-3 py-2 text-sm" required />
        <button type="submit" disabled={saving} className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Submit"}</button>
      </form>
    </Sheet>
  );
}

function ReturnReceiveSheet({ sessionId, returns, onClose, onSaved }: { sessionId: string; returns: PendingReturn[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [returnId, setReturnId] = useState(returns[0]?.id ?? "");
  const [good, setGood] = useState("");
  const [damaged, setDamaged] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = returns.find((r) => r.id === returnId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/linen/return", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ action: "receive_return", return_id: returnId, good_quantity: Number(good), damaged_quantity: Number(damaged) }),
      });
      const data = (await res.json()) as { error?: string; shortage?: number };
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      if ((data.shortage ?? 0) > 0) toast.warning(`Shortage ${data.shortage} — follow-up created`);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Receive return from ward" onClose={onClose}>
      {returns.length === 0 ? <p className="text-sm text-slate-500">No pending returns.</p> : (
        <form className="space-y-3" onSubmit={onSubmit}>
          <select value={returnId} onChange={(e) => setReturnId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            {returns.map((r) => (
              <option key={r.id} value={r.id}>
                {r.item_name} · Qty {r.quantity}
              </option>
            ))}
          </select>
          {selected ? <p className="text-xs text-slate-500">Original qty: {selected.quantity}</p> : null}
          <input type="number" min={0} step="0.01" value={good} onChange={(e) => setGood(e.target.value)} placeholder="Good quantity" className="w-full rounded-lg border px-3 py-2 text-sm" required />
          <input type="number" min={0} step="0.01" value={damaged} onChange={(e) => setDamaged(e.target.value)} placeholder="Damaged quantity" className="w-full rounded-lg border px-3 py-2 text-sm" required />
          <button type="submit" disabled={saving} className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Submit"}</button>
        </form>
      )}
    </Sheet>
  );
}

function ResolveFollowupSheet({ sessionId, followup, onClose, onSaved }: { sessionId: string; followup: FollowupRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [resolution, setResolution] = useState("recovered");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/linen/followups/${followup.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ resolution, resolution_note: note.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Resolve follow-up" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">{followup.item_name} · Qty {followup.quantity}</p>
      <form className="space-y-3" onSubmit={onSubmit}>
        <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
          <option value="recovered">Recovered</option>
          <option value="written_off">Written Off</option>
          <option value="vendor_deducted">Vendor Deducted</option>
        </select>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} required placeholder="Resolution note" className="w-full rounded-lg border px-3 py-2 text-sm" rows={3} />
        <button type="submit" disabled={saving || !note.trim()} className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Resolve"}</button>
      </form>
    </Sheet>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
