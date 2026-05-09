"use client";

import { FormEvent, useEffect, useState } from "react";

type VendorRow = {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  user_id: string | null;
  is_active: boolean;
};

type UserOpt = { id: string; full_name: string; login_id: string; role: string; is_active: boolean };

export function VendorFormSheet({
  sessionId,
  mode,
  vendorId,
  initial,
  isCeo,
  onClose,
  onSaved,
}: {
  sessionId: string;
  mode: "create" | "edit";
  vendorId?: string;
  initial?: VendorRow | null;
  isCeo: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [userId, setUserId] = useState(initial?.user_id ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active !== false);
  const [vendorUsers, setVendorUsers] = useState<UserOpt[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isCeo) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users", { headers: { "x-actor-id": sessionId } });
        const data = (await res.json()) as { users?: UserOpt[] };
        if (!res.ok || cancelled) return;
        const v = (data.users ?? []).filter((u) => u.role === "vendor" && u.is_active);
        setVendorUsers(v);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, isCeo]);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setCategory(initial.category ?? "");
      setPhone(initial.phone ?? "");
      setUserId(initial.user_id ?? "");
      setIsActive(initial.is_active);
    }
  }, [initial]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
          body: JSON.stringify({
            name,
            category,
            phone,
            user_id: userId || null,
            is_active: isActive,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not save");
          return;
        }
      } else if (vendorId) {
        const res = await fetch(`/api/vendors/${vendorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
          body: JSON.stringify({
            name,
            category,
            phone,
            user_id: userId || null,
            is_active: isActive,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not save");
          return;
        }
      }
      onSaved();
      onClose();
    } catch {
      setError("Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">{mode === "create" ? "New vendor" : "Edit vendor"}</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          {isCeo ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Link user (vendor role, optional)</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              >
                <option value="">None</option>
                {vendorUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} · {u.login_id}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-slate-300" />
            Active
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
