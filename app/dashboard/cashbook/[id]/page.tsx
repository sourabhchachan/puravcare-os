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
};

type MemberRow = { user_id: string; full_name: string; role: string };

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
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
                  <span className="text-slate-600">{formatEntryDate(e.entry_date)}</span>
                  {canEdit ? (
                    <button type="button" className="text-xs font-medium text-[#2563EB]" onClick={() => setEditEntry(e)}>
                      Edit
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 font-medium text-slate-900">{e.description || "—"}</p>
                <div className="mt-2 flex justify-between text-xs text-slate-600">
                  <span>
                    {e.entry_type === "in" ? <span className="font-semibold text-emerald-600">IN {formatInr(Number(e.amount))}</span> : null}
                    {e.entry_type === "out" ? <span className="font-semibold text-red-600">OUT {formatInr(Number(e.amount))}</span> : null}
                  </span>
                  <span>{e.created_by_name}</span>
                </div>
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

function EntrySheet({
  mode,
  sessionId,
  cashbookId,
  canBackdate,
  initial,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  sessionId: string;
  cashbookId: string;
  canBackdate: string;
  initial?: EntryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [entryType, setEntryType] = useState<"in" | "out">((initial?.entry_type as "in" | "out") ?? "in");
  const [amount, setAmount] = useState(initial != null ? String(initial.amount) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [entryDate, setEntryDate] = useState(() => {
    if (initial?.entry_date) return ymd(new Date(initial.entry_date));
    return ymd(new Date());
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const n = Number(amount);
      if (Number.isNaN(n) || n <= 0) {
        setError("Enter a valid amount.");
        toast.error("Enter a valid amount.");
        setSaving(false);
        return;
      }
      if (mode === "add") {
        const res = await fetch(`/api/cashbooks/${cashbookId}/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
          body: JSON.stringify({
            entry_type: entryType,
            amount: n,
            description,
            entry_date: entryDate,
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
            description,
            entry_date: entryDate,
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">{mode === "add" ? "Add entry" : "Edit entry"}</h2>
        <p className="mt-1 text-xs text-slate-500">{dateHint}</p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
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
          <button type="submit" disabled={saving} className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
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
