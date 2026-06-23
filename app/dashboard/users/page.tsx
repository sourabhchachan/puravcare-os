"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { SYSTEM_ADMIN_LOGIN_ID } from "@/lib/api/pin";
import { useAuth } from "@/lib/hooks/useAuth";

type Permissions = {
  can_create_tasks: boolean;
  can_create_items: boolean;
};

type UserRow = {
  id: string;
  staff_id: string;
  full_name: string;
  role: string;
  login_id: string;
  is_active: boolean;
  permissions: Permissions | null;
};

type UserSort = "az" | "za";

export default function UsersManagementPage() {
  const { session, loading: authLoading } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<UserSort>("az");
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);

  const canResetPin = session?.role === "ceo" || session?.login_id === SYSTEM_ADMIN_LOGIN_ID;

  const load = useCallback(async () => {
    if (!session || session.role !== "ceo") return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users", { headers: { "x-actor-id": session.id } });
      if (!res.ok) {
        setError("Could not load users.");
        toast.error("Could not load users.");
        return;
      }
      const data = (await res.json()) as { users?: UserRow[] };
      setUsers(data.users ?? []);
    } catch {
      setError("Could not load users.");
      toast.error("Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [session, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? users.filter(
          (u) =>
            u.full_name.toLowerCase().includes(q) ||
            u.staff_id.toLowerCase().includes(q) ||
            u.login_id.includes(q),
        )
      : [...users];
    list = [...list].sort((a, b) =>
      sort === "az"
        ? a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" })
        : b.full_name.localeCompare(a.full_name, undefined, { sensitivity: "base" }),
    );
    return list;
  }, [users, search, sort]);

  if (authLoading || !session) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (session.role !== "ceo") {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center text-red-700 shadow-sm">
        Access denied
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">User management</h1>
          <p className="text-sm text-slate-500">Staff accounts and access</p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
        >
          Add User
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or staff ID…"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "az" as const, label: "A–Z" },
            { id: "za" as const, label: "Z–A" },
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
        <div className="space-y-2">
          {filtered.map((u) => (
            <div
              key={u.id}
              className="flex w-full flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
            >
              <button type="button" onClick={() => setEditUser(u)} className="w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{u.full_name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <span>Staff ID: {u.staff_id}</span>
                  <span>Login: {u.login_id}</span>
                  <span className="col-span-2 capitalize">Role: {u.role}</span>
                </div>
              </button>
              {canResetPin ? (
                <button
                  type="button"
                  onClick={() => setResetTarget(u)}
                  className="mt-3 self-start rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800"
                >
                  Reset PIN
                </button>
              ) : null}
            </div>
          ))}
          {filtered.length === 0 ? <p className="text-sm text-slate-500">No users match.</p> : null}
        </div>
      )}

      {addOpen ? (
        <AddUserSheet
          actorId={session.id}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            toast.success("User created");
            void load();
          }}
        />
      ) : null}

      {editUser ? (
        <EditUserSheet
          actorId={session.id}
          selfId={session.id}
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
            toast.success("User updated");
            void load();
          }}
        />
      ) : null}

      {resetTarget ? (
        <ResetPinSheet
          actorId={session.id}
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onSaved={() => {
            setResetTarget(null);
            toast.success("PIN reset to 000000");
          }}
        />
      ) : null}
    </div>
  );
}

function ResetPinSheet({
  actorId,
  user,
  onClose,
  onSaved,
}: {
  actorId: string;
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await fetch("/api/auth/reset-pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": actorId },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Could not reset PIN");
        return;
      }
      onSaved();
    } catch {
      toast.error("Could not reset PIN");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-slate-900">Reset PIN?</h2>
        <p className="mt-2 text-sm text-slate-600">
          Reset PIN for <span className="font-semibold">{user.full_name}</span> to 000000?
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-3 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleConfirm()}
            className="flex-1 rounded-lg bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Resetting…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddUserSheet({
  actorId,
  onClose,
  onSaved,
}: {
  actorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"ceo" | "ops" | "staff" | "vendor">("staff");
  const [loginId, setLoginId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_id: actorId,
          full_name: fullName,
          role,
          login_id: loginId,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (body.error === "duplicate_login") setError("Login ID already in use.");
        else if (body.error === "too_many_ceos") setError("Maximum of 5 active CEO users allowed.");
        else setError("Could not create user.");
        toast.error(
          body.error === "duplicate_login"
            ? "Login ID already in use."
            : body.error === "too_many_ceos"
              ? "Maximum of 5 active CEO users allowed."
              : "Could not create user.",
        );
        return;
      }
      onSaved();
    } catch {
      setError("Could not create user.");
      toast.error("Could not create user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" aria-label="Close" className="flex-1" onClick={onClose} />
      <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Add user</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            >
              <option value="ceo">CEO</option>
              <option value="ops">Ops</option>
              <option value="staff">Staff</option>
              <option value="vendor">Vendor</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Login ID (10 digits)</label>
            <input
              inputMode="numeric"
              maxLength={10}
              value={loginId}
              onChange={(e) => setLoginId(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || loginId.length !== 10}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditUserSheet({
  actorId,
  selfId,
  user,
  onClose,
  onSaved,
}: {
  actorId: string;
  selfId: string;
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [fullName, setFullName] = useState(user.full_name);
  const [loginId, setLoginId] = useState(user.login_id);
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [blockTaskCreation, setBlockTaskCreation] = useState(user.permissions?.can_create_tasks === false);
  const [canCreateItems, setCanCreateItems] = useState(Boolean(user.permissions?.can_create_items));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const showPermissions = role === "ops" || role === "staff";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        actor_id: actorId,
        full_name: fullName,
        login_id: loginId,
        role,
        is_active: isActive,
      };
      if (showPermissions) {
        payload.can_create_tasks = !blockTaskCreation;
        payload.can_create_items = canCreateItems;
      }

      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (body.error === "duplicate_login") setError("Login ID already in use.");
        else if (body.error === "cannot_deactivate_self") setError("You cannot deactivate yourself.");
        else if (body.error === "too_many_ceos") setError("Maximum of 5 active CEO users allowed.");
        else setError("Could not save changes.");
        toast.error(
          body.error === "duplicate_login"
            ? "Login ID already in use."
            : body.error === "cannot_deactivate_self"
              ? "You cannot deactivate yourself."
              : body.error === "too_many_ceos"
                ? "Maximum of 5 active CEO users allowed."
                : "Could not save changes.",
        );
        return;
      }
      onSaved();
    } catch {
      setError("Could not save changes.");
      toast.error("Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" aria-label="Close" className="flex-1" onClick={onClose} />
      <div className="mx-auto max-h-[85vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Edit user</h2>
        <p className="mt-1 text-xs text-slate-500">Staff ID: {user.staff_id} (cannot change)</p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Login ID (10 digits)</label>
            <input
              inputMode="numeric"
              maxLength={10}
              value={loginId}
              onChange={(e) => setLoginId(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
            <select
              value={role}
              onChange={(e) => {
                const r = e.target.value;
                const prev = role;
                setRole(r);
                if ((prev === "ops" || prev === "staff") && r !== "ops" && r !== "staff") {
                  setBlockTaskCreation(false);
                  setCanCreateItems(false);
                }
                if ((r === "ops" || r === "staff") && prev !== "ops" && prev !== "staff") {
                  setBlockTaskCreation(user.permissions?.can_create_tasks === false);
                  setCanCreateItems(Boolean(user.permissions?.can_create_items));
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            >
              <option value="ceo">CEO</option>
              <option value="ops">Ops</option>
              <option value="staff">Staff</option>
              <option value="vendor">Vendor</option>
            </select>
          </div>

          {showPermissions ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Permissions</p>
              <label className="flex items-center justify-between gap-2 text-sm text-slate-800">
                <span>Block task creation</span>
                <input type="checkbox" checked={blockTaskCreation} onChange={(e) => setBlockTaskCreation(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm text-slate-800">
                <span>Can create items</span>
                <input type="checkbox" checked={canCreateItems} onChange={(e) => setCanCreateItems(e.target.checked)} />
              </label>
            </div>
          ) : null}

          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
            <span className="text-sm text-slate-700">Active</span>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => {
                const next = e.target.checked;
                if (user.id === selfId && !next) return;
                setIsActive(next);
              }}
              className="h-4 w-4"
            />
          </label>
          {user.id === selfId ? (
            <p className="text-xs text-slate-500">You cannot deactivate your own account.</p>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || loginId.length !== 10}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
