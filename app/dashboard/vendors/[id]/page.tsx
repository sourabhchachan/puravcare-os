"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { VendorFormSheet } from "@/components/vendors/VendorFormSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type VendorRow = {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  is_active: boolean;
};

type IndentPreview = { id: string; item_description: string; status: string; created_at: string };
type ItemRow = { id: string; name: string; price: number; is_active: boolean };
type LinkedUser = { id: string; full_name: string; login_id: string };
type UserOpt = { id: string; full_name: string; login_id: string; role: string; is_active: boolean };

function indentBadge(status: string) {
  if (status === "pending") return "bg-yellow-100 text-yellow-900";
  if (status === "dispatched") return "bg-blue-100 text-blue-800";
  if (status === "delivered") return "bg-emerald-100 text-emerald-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-600";
}

export default function VendorDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { session, loading } = useAuth();
  const toast = useToast();
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [indents, setIndents] = useState<IndentPreview[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [linkedUsers, setLinkedUsers] = useState<LinkedUser[]>([]);
  const [vendorUsers, setVendorUsers] = useState<UserOpt[]>([]);
  const [err, setErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const isCeo = session?.role === "ceo";
  console.log("[vendor detail] session.role:", session?.role, "isCeo:", isCeo);
  const isCeoOrOps = session?.role === "ceo" || session?.role === "ops";

  const load = useCallback(async () => {
    if (!session || !id) return;
    setLoadingData(true);
    setErr("");
    try {
      const res = await fetch(`/api/vendors/${id}`, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as {
        vendor?: VendorRow;
        indents?: IndentPreview[];
        items?: ItemRow[];
        linked_users?: LinkedUser[];
        error?: string;
      };
      if (!res.ok) {
        setErr(data.error ?? "Not found");
        toast.error(data.error ?? "Not found");
        setVendor(null);
        return;
      }
      setVendor(data.vendor ?? null);
      setIndents(data.indents ?? []);
      setItems(data.items ?? []);
      setLinkedUsers(data.linked_users ?? []);
    } catch {
      setErr("Could not load");
      toast.error("Could not load");
      setVendor(null);
    } finally {
      setLoadingData(false);
    }
  }, [session, id, toast]);

  useEffect(() => {
    console.log("[vendor detail] fetch users effect - isCeo:", isCeo, "session:", session?.id);
    if (!session || !isCeo) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users", { headers: { "x-actor-id": session.id } });
        const data = (await res.json()) as { users?: UserOpt[] };
        if (!res.ok || cancelled) return;
        setVendorUsers((data.users ?? []).filter((u) => u.is_active));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, isCeo]);

  async function removeLinkedUser(userId: string) {
    if (!session || !vendor || !isCeo) return;
    setRemovingUserId(userId);
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": session.id },
        body: JSON.stringify({ remove_user_id: userId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Could not remove user");
        return;
      }
      toast.success("User unlinked");
      void load();
    } catch {
      toast.error("Could not remove user");
    } finally {
      setRemovingUserId(null);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;
  if (loadingData) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!vendor) return <p className="text-sm text-red-600">{err || "Not found"}</p>;

  const preview = indents.slice(0, 5);

  return (
    <div className="space-y-4 pb-8">
      <Link href="/dashboard/vendors" className="text-xs font-medium text-[#2563EB]">
        ← Vendors
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{vendor.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{vendor.category ?? "—"}</p>
            <p className="text-sm text-slate-500">{vendor.phone ?? "—"}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              vendor.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
            }`}
          >
            {vendor.is_active ? "active" : "inactive"}
          </span>
        </div>
        {isCeo ? (
          <button type="button" onClick={() => setEditOpen(true)} className="mt-3 text-xs font-semibold text-[#2563EB]">
            Edit vendor
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Linked users</h2>
          {isCeo ? (
            <button type="button" onClick={() => setAddUserOpen(true)} className="text-xs font-semibold text-[#2563EB]">
              Add User
            </button>
          ) : null}
        </div>
        {linkedUsers.length === 0 ? (
          <p className="text-sm text-slate-500">No linked users.</p>
        ) : (
          <ul className="space-y-2">
            {linkedUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-sm text-slate-700">
                  {u.full_name} <span className="text-slate-500">({u.login_id})</span>
                </p>
                {isCeo ? (
                  <button
                    type="button"
                    onClick={() => void removeLinkedUser(u.id)}
                    disabled={removingUserId === u.id}
                    className="text-xs font-semibold text-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {isCeoOrOps ? (
        <Link
          href={`/dashboard/vendors/${id}/indents`}
          className="block rounded-xl border border-[#2563EB]/30 bg-blue-50/50 p-4 text-sm font-semibold text-[#2563EB] shadow-sm"
        >
          Indents → manage purchase orders
        </Link>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Recent indents</h2>
          {isCeoOrOps ? (
            <Link href={`/dashboard/vendors/${id}/indents`} className="text-xs font-medium text-[#2563EB]">
              View all
            </Link>
          ) : null}
        </div>
        {preview.length === 0 ? (
          <p className="text-sm text-slate-500">No indents yet.</p>
        ) : (
          <ul className="space-y-2">
            {preview.map((i) => (
              <li key={i.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${indentBadge(i.status)}`}>{i.status}</span>
                {i.item_description}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Items from master</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No items linked.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <span className="font-medium text-slate-900">{it.name}</span>
                <span className="ml-2 text-xs text-slate-500">₹{Number(it.price).toFixed(2)}</span>
                {!it.is_active ? <span className="ml-2 text-[10px] font-semibold text-slate-400">inactive</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editOpen && isCeo ? (
        <VendorFormSheet
          sessionId={session.id}
          mode="edit"
          vendorId={vendor.id}
          initial={vendor}
          isCeo
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            toast.success("Vendor updated");
            void load();
          }}
        />
      ) : null}

      {addUserOpen && isCeo ? (
        <AddLinkedUserSheet
          sessionId={session.id}
          vendorId={vendor.id}
          users={vendorUsers}
          linkedUserIds={new Set(linkedUsers.map((u) => u.id))}
          onClose={() => setAddUserOpen(false)}
          onSaved={() => {
            setAddUserOpen(false);
            toast.success("User linked");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function AddLinkedUserSheet({
  sessionId,
  vendorId,
  users,
  linkedUserIds,
  onClose,
  onSaved,
}: {
  sessionId: string;
  vendorId: string;
  users: UserOpt[];
  linkedUserIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const availableUsers = users.filter((u) => !linkedUserIds.has(u.id));

  async function submit() {
    if (!userId) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/vendors/${vendorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ add_user_id: userId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not link user");
        toast.error(data.error ?? "Could not link user");
        return;
      }
      onSaved();
    } catch {
      setError("Could not link user");
      toast.error("Could not link user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Add linked user</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">User</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            >
              <option value="">Select user</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} · {u.login_id}
                </option>
              ))}
            </select>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !userId}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Link user"}
          </button>
        </div>
      </div>
    </div>
  );
}
