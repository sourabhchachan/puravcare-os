"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type CashbookCard = {
  id: string;
  name: string;
  description: string | null;
  balance: number;
  member_count: number;
};

type UserOpt = { id: string; full_name: string; role: string };

type ExtraMember = {
  user_id: string;
  role: "admin" | "data_operator";
  can_backdate: "always" | "never" | "1day";
  can_edit_own: boolean;
  hide_balance: boolean;
  hide_others_entries: boolean;
};

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

function balanceClass(n: number) {
  if (n > 0) return "text-emerald-600";
  if (n < 0) return "text-red-600";
  return "text-slate-600";
}

export default function CashbookListPage() {
  const { session, loading: authLoading } = useAuth();
  const toast = useToast();
  const [cashbooks, setCashbooks] = useState<CashbookCard[]>([]);
  const [isCeo, setIsCeo] = useState(false);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cashbooks", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { cashbooks?: CashbookCard[]; is_ceo?: boolean; users?: UserOpt[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load cashbooks");
        toast.error(data.error ?? "Could not load cashbooks");
        return;
      }
      setCashbooks(data.cashbooks ?? []);
      setIsCeo(Boolean(data.is_ceo));
      setUsers(data.users ?? []);
    } catch {
      setError("Could not load cashbooks");
      toast.error("Could not load cashbooks");
    } finally {
      setLoading(false);
    }
  }, [session, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (authLoading || !session) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Cashbooks</h1>
          <p className="text-sm text-slate-500">Balances and entries by book</p>
        </div>
        {isCeo ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
          >
            New Cashbook
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {cashbooks.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/cashbook/${c.id}`}
                className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#2563EB]/40"
              >
                <p className="font-semibold text-slate-900">{c.name}</p>
                <p className={`text-sm font-medium ${balanceClass(c.balance)}`}>{formatInr(c.balance)}</p>
                <p className="text-xs text-slate-500">{c.member_count} member{c.member_count === 1 ? "" : "s"}</p>
              </Link>
            </li>
          ))}
          {cashbooks.length === 0 ? <p className="text-sm text-slate-500">No cashbooks yet.</p> : null}
        </ul>
      )}

      {sheetOpen && session ? (
        <CreateCashbookSheet
          sessionId={session.id}
          users={users}
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            setSheetOpen(false);
            toast.success("Cashbook created");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateCashbookSheet({
  sessionId,
  users,
  onClose,
  onSaved,
}: {
  sessionId: string;
  users: UserOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [extras, setExtras] = useState<ExtraMember[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function addRow() {
    setExtras((prev) => [
      ...prev,
      {
        user_id: "",
        role: "admin",
        can_backdate: "never",
        can_edit_own: false,
        hide_balance: false,
        hide_others_entries: false,
      },
    ]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const members = extras
        .filter((x) => x.user_id)
        .map((x) => ({
          user_id: x.user_id,
          role: x.role,
          ...(x.role === "data_operator"
            ? {
                can_backdate: x.can_backdate,
                can_edit_own: x.can_edit_own,
                hide_balance: x.hide_balance,
                hide_others_entries: x.hide_others_entries,
              }
            : {}),
        }));
      const res = await fetch("/api/cashbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, members }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create");
        toast.error(data.error ?? "Could not create");
        return;
      }
      onSaved();
    } catch {
      setError("Could not create");
      toast.error("Could not create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[92vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">New cashbook</h2>
        <p className="mt-1 text-xs text-slate-500">You will be added as primary admin.</p>
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Members</p>
              <button type="button" onClick={addRow} className="text-xs font-medium text-[#2563EB]">
                + Add member
              </button>
            </div>
            {extras.map((row, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <select
                  value={row.user_id}
                  onChange={(e) => {
                    const v = e.target.value;
                    setExtras((p) => p.map((r, i) => (i === idx ? { ...r, user_id: v } : r)));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Select user</option>
                  {users
                    .filter((u) => u.id !== sessionId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role})
                      </option>
                    ))}
                </select>
                <select
                  value={row.role}
                  onChange={(e) => {
                    const role = e.target.value as ExtraMember["role"];
                    setExtras((p) => p.map((r, i) => (i === idx ? { ...r, role } : r)));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="data_operator">Data operator</option>
                </select>
                {row.role === "data_operator" ? (
                  <div className="space-y-2 text-xs">
                    <label className="block text-slate-600">
                      Can backdate
                      <select
                        value={row.can_backdate}
                        onChange={(e) => {
                          const can_backdate = e.target.value as ExtraMember["can_backdate"];
                          setExtras((p) => p.map((r, i) => (i === idx ? { ...r, can_backdate } : r)));
                        }}
                        className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
                      >
                        <option value="always">Always</option>
                        <option value="never">Never</option>
                        <option value="1day">1 day</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Can edit own entries</span>
                      <input
                        type="checkbox"
                        checked={row.can_edit_own}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setExtras((p) => p.map((r, i) => (i === idx ? { ...r, can_edit_own: v } : r)));
                        }}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Hide balance</span>
                      <input
                        type="checkbox"
                        checked={row.hide_balance}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setExtras((p) => p.map((r, i) => (i === idx ? { ...r, hide_balance: v } : r)));
                        }}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Hide others&apos; entries</span>
                      <input
                        type="checkbox"
                        checked={row.hide_others_entries}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setExtras((p) => p.map((r, i) => (i === idx ? { ...r, hide_others_entries: v } : r)));
                        }}
                      />
                    </label>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() => setExtras((p) => p.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create cashbook"}
          </button>
        </form>
      </div>
    </div>
  );
}
