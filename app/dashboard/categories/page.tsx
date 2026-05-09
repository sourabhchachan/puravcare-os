"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type Row = { id: string; name: string; is_active: boolean; entry_count: number };

export default function CategoriesPage() {
  const { session, loading: authLoading } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch("/api/cashbook-categories", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { categories?: Row[]; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Could not load");
        return;
      }
      setRows(data.categories ?? []);
    } catch {
      toast.error("Could not load");
    } finally {
      setLoading(false);
    }
  }, [session, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  async function toggleActive(r: Row, next: boolean) {
    if (!session) return;
    const res = await fetch(`/api/cashbook-categories/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-actor-id": session.id },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) {
      toast.error("Could not update");
      return;
    }
    toast.success(next ? "Activated" : "Deactivated");
    void load();
  }

  async function removeRow(r: Row) {
    if (!session || r.entry_count > 0) return;
    if (!confirm(`Delete category “${r.name}”?`)) return;
    const res = await fetch(`/api/cashbook-categories/${r.id}`, {
      method: "DELETE",
      headers: { "x-actor-id": session.id },
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(data.error === "in_use" ? "Cannot delete: used in entries" : "Could not delete");
      return;
    }
    toast.success("Deleted");
    void load();
  }

  if (authLoading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (session.role !== "ceo") {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center text-red-700 shadow-sm">CEO only</div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Categories</h1>
          <p className="text-sm text-slate-500">Cashbook category master</p>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
        >
          New
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
      />

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      <ul className="space-y-2">
        {filtered.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-slate-900">{r.name}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                {r.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void toggleActive(r, !r.is_active)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
              >
                {r.is_active ? "Deactivate" : "Reactivate"}
              </button>
              {r.entry_count === 0 ? (
                <button type="button" onClick={() => void removeRow(r)} className="text-xs font-semibold text-red-600">
                  Delete
                </button>
              ) : (
                <span className="text-xs text-slate-500">Used in {r.entry_count} entr{r.entry_count === 1 ? "y" : "ies"}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!loading && filtered.length === 0 ? <p className="text-sm text-slate-500">No categories.</p> : null}

      {sheetOpen && session ? (
        <NewSheet
          sessionId={session.id}
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            setSheetOpen(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function NewSheet({ sessionId, onClose, onSaved }: { sessionId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      const res = await fetch("/api/cashbook-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error === "duplicate_name" ? "Name already exists" : data.error ?? "Failed");
        toast.error(data.error === "duplicate_name" ? "Name already exists" : "Failed");
        return;
      }
      toast.success("Category added");
      onSaved();
    } catch {
      setErr("Failed");
      toast.error("Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold text-[#2563EB]">New category</h2>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          <button type="submit" disabled={saving || !name.trim()} className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50">
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
