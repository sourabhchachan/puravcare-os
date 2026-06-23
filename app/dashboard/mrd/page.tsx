"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type MrdFile = {
  id: string;
  ipd_number: string;
  patient_name: string | null;
  status: string;
  days_out_of_mrd: number;
  highlight_overdue: boolean;
  added_manually: boolean;
};

type MrdRequest = {
  id: string;
  file_id: string;
  request_type: string;
  purpose: string;
  status: string;
  requested_by: string;
  requester_name: string;
  ipd_number: string | null;
  patient_name: string | null;
  days_since_dispatched: number;
};

type MrdMember = {
  id: string;
  user_id: string;
  full_name: string;
  staff_id: string;
  role: string;
};

type UserOpt = { id: string; full_name: string; staff_id: string };

const FILE_STATUSES = ["all", "missing", "in_mrd", "with_staff", "with_insurance"] as const;

function statusLabel(status: string) {
  const map: Record<string, string> = {
    missing: "Missing",
    in_mrd: "In MRD",
    with_staff: "With staff",
    with_insurance: "With insurance",
    pending: "Pending",
    dispatched: "Dispatched",
    received: "Received",
    returned: "Returned",
  };
  return map[status] ?? status;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "missing":
      return "bg-amber-100 text-amber-800";
    case "in_mrd":
      return "bg-emerald-100 text-emerald-800";
    case "with_staff":
      return "bg-blue-100 text-blue-800";
    case "with_insurance":
      return "bg-violet-100 text-violet-800";
    case "pending":
      return "bg-slate-100 text-slate-700";
    case "dispatched":
      return "bg-sky-100 text-sky-800";
    case "received":
      return "bg-indigo-100 text-indigo-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function MrdPage() {
  const { session, loading: authLoading } = useAuth();
  const toast = useToast();

  const [access, setAccess] = useState<{ can_view_mrd: boolean; is_ceo: boolean } | null>(null);
  const [tab, setTab] = useState<"files" | "requests" | "members">("files");
  const [files, setFiles] = useState<MrdFile[]>([]);
  const [requests, setRequests] = useState<MrdRequest[]>([]);
  const [members, setMembers] = useState<MrdMember[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<(typeof FILE_STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [addFileOpen, setAddFileOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newIpd, setNewIpd] = useState("");
  const [newMemberId, setNewMemberId] = useState("");
  const [actorId, setActorId] = useState("");

  const isCeo = access?.is_ceo ?? false;
  const canManage = access?.can_view_mrd ?? false;

  const loadFiles = useCallback(async () => {
    if (!session) return;
    const res = await fetch("/api/mrd/files", { headers: { "x-actor-id": session.id } });
    const data = (await res.json()) as { files?: MrdFile[] };
    if (res.ok) setFiles(data.files ?? []);
  }, [session]);

  const loadRequests = useCallback(async () => {
    if (!session) return;
    const res = await fetch("/api/mrd/requests", { headers: { "x-actor-id": session.id } });
    const data = (await res.json()) as { requests?: MrdRequest[]; actor_id?: string };
    if (res.ok) {
      setRequests(data.requests ?? []);
      setActorId(data.actor_id ?? session.id);
    }
  }, [session]);

  const loadMembers = useCallback(async () => {
    if (!session || !isCeo) return;
    const [membersRes, usersRes] = await Promise.all([
      fetch("/api/mrd/members", { headers: { "x-actor-id": session.id } }),
      fetch("/api/users", { headers: { "x-actor-id": session.id } }),
    ]);
    const membersData = (await membersRes.json()) as { members?: MrdMember[] };
    const usersData = (await usersRes.json()) as { users?: { id: string; full_name: string; staff_id: string; is_active: boolean }[] };
    if (membersRes.ok) setMembers(membersData.members ?? []);
    if (usersRes.ok) {
      const memberIds = new Set((membersData.members ?? []).map((m) => m.user_id));
      setUsers(
        (usersData.users ?? [])
          .filter((u) => u.is_active && !memberIds.has(u.id))
          .map((u) => ({ id: u.id, full_name: u.full_name, staff_id: u.staff_id })),
      );
    }
  }, [session, isCeo]);

  const loadAll = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch("/api/mrd/access", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { can_view_mrd?: boolean; is_ceo?: boolean };
      if (!res.ok || !data.can_view_mrd) {
        setAccess({ can_view_mrd: false, is_ceo: false });
        return;
      }
      setAccess({ can_view_mrd: true, is_ceo: Boolean(data.is_ceo) });
      await Promise.all([loadFiles(), loadRequests()]);
    } finally {
      setLoading(false);
    }
  }, [session, loadFiles, loadRequests]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (tab === "members" && isCeo) void loadMembers();
  }, [tab, isCeo, loadMembers]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (!q) return true;
      return (
        f.ipd_number.toLowerCase().includes(q) ||
        (f.patient_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [files, statusFilter, search]);

  async function patchFile(id: string, action: string) {
    if (!session) return;
    const res = await fetch(`/api/mrd/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-actor-id": session.id },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "Action failed");
      return;
    }
    toast.success("Updated");
    await loadFiles();
  }

  async function patchRequest(id: string, action: string) {
    if (!session) return;
    const res = await fetch(`/api/mrd/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-actor-id": session.id },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "Action failed");
      return;
    }
    toast.success("Updated");
    await Promise.all([loadRequests(), loadFiles()]);
  }

  async function handleAddFile(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const res = await fetch("/api/mrd/files", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-id": session.id },
      body: JSON.stringify({ ipd_number: newIpd.trim() }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "Could not add file");
      return;
    }
    toast.success("File added");
    setAddFileOpen(false);
    setNewIpd("");
    await loadFiles();
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const res = await fetch("/api/mrd/members", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-id": session.id },
      body: JSON.stringify({ user_id: newMemberId }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "Could not add member");
      return;
    }
    toast.success("Member added");
    setAddMemberOpen(false);
    setNewMemberId("");
    await loadMembers();
  }

  async function removeMember(userId: string) {
    if (!session) return;
    const res = await fetch(`/api/mrd/members?user_id=${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { "x-actor-id": session.id },
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "Could not remove");
      return;
    }
    toast.success("Member removed");
    await loadMembers();
  }

  if (authLoading || !session || loading) return <p className="text-sm text-slate-500">Loading…</p>;

  if (access && !access.can_view_mrd) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center text-red-700 shadow-sm">
        Access denied
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Medical Records</h1>
        <p className="text-sm text-slate-500">Track patient files, borrows, and insurance</p>
      </div>

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {(["files", "requests", ...(isCeo ? (["members"] as const) : [])] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-2 text-xs font-semibold capitalize ${
              tab === t ? "bg-[#2563EB] text-white" : "text-slate-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {tab === "files" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="Search IPD or patient"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            {isCeo ? (
              <button
                type="button"
                onClick={() => setAddFileOpen(true)}
                className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
              >
                Add File
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1">
            {FILE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  statusFilter === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {s === "all" ? "All" : statusLabel(s)}
              </button>
            ))}
          </div>

          <ul className="space-y-2">
            {filteredFiles.map((f) => (
              <li
                key={f.id}
                className={`rounded-xl border bg-white p-3 shadow-sm ${
                  f.highlight_overdue ? "border-orange-300 bg-orange-50" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">IPD-{f.ipd_number}</p>
                    <p className="text-sm text-slate-600">{f.patient_name ?? "Unknown patient"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(f.status)}`}>
                    {statusLabel(f.status)}
                  </span>
                </div>
                {f.days_out_of_mrd > 0 ? (
                  <p className={`mt-2 text-xs font-medium ${f.highlight_overdue ? "text-orange-700" : "text-slate-500"}`}>
                    {f.days_out_of_mrd} day{f.days_out_of_mrd === 1 ? "" : "s"} out of MRD
                    {f.highlight_overdue ? " — overdue" : ""}
                  </p>
                ) : null}
                {canManage ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {f.status === "missing" ? (
                      <button
                        type="button"
                        onClick={() => void patchFile(f.id, "mark_received")}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                      >
                        Mark Received
                      </button>
                    ) : null}
                    {f.status === "in_mrd" ? (
                      <button
                        type="button"
                        onClick={() => void patchFile(f.id, "send_to_insurance")}
                        className="rounded-lg border border-violet-200 px-2.5 py-1 text-[11px] font-semibold text-violet-700"
                      >
                        Send to Insurance
                      </button>
                    ) : null}
                    {f.status === "with_insurance" ? (
                      <button
                        type="button"
                        onClick={() => void patchFile(f.id, "return_from_insurance")}
                        className="rounded-lg border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
                      >
                        Return from Insurance
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
            {!loading && !filteredFiles.length ? (
              <li className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No files found
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {tab === "requests" ? (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    IPD-{r.ipd_number ?? "—"} · {r.requester_name}
                  </p>
                  <p className="text-xs text-slate-500">{r.purpose}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {r.request_type === "return" ? "Return request" : "Borrow request"}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(r.status)}`}>
                  {statusLabel(r.status)}
                </span>
              </div>
              {r.days_since_dispatched > 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  {r.days_since_dispatched} day{r.days_since_dispatched === 1 ? "" : "s"} since dispatched
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {canManage && r.request_type === "borrow" && r.status === "pending" ? (
                  <button
                    type="button"
                    onClick={() => void patchRequest(r.id, "dispatch")}
                    className="rounded-lg bg-[#2563EB] px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    Dispatch
                  </button>
                ) : null}
                {r.request_type === "borrow" &&
                r.status === "dispatched" &&
                (r.requested_by === actorId || isCeo) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void patchRequest(r.id, "receive")}
                      className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                    >
                      Mark Received
                    </button>
                    <button
                      type="button"
                      onClick={() => void patchRequest(r.id, "return")}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                    >
                      Return File
                    </button>
                  </>
                ) : null}
                {r.request_type === "borrow" &&
                r.status === "received" &&
                (r.requested_by === actorId || isCeo) ? (
                  <button
                    type="button"
                    onClick={() => void patchRequest(r.id, "return")}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    Return File
                  </button>
                ) : null}
                {canManage && r.request_type === "return" && r.status === "pending" ? (
                  <button
                    type="button"
                    onClick={() => void patchRequest(r.id, "receive_return")}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    Receive Return
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {!loading && !requests.length ? (
            <li className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No active requests
            </li>
          ) : null}
        </ul>
      ) : null}

      {tab === "members" && isCeo ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setAddMemberOpen(true)}
            className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
          >
            Add Member
          </button>
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{m.full_name}</p>
                  <p className="text-xs text-slate-500">
                    {m.staff_id} · {m.role}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeMember(m.user_id)}
                  className="text-xs font-semibold text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {addFileOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
          <button type="button" aria-label="Close" className="flex-1" onClick={() => setAddFileOpen(false)} />
          <form onSubmit={handleAddFile} className="mx-auto w-full max-w-[430px] space-y-3 rounded-t-2xl bg-white p-5">
            <h2 className="text-lg font-semibold">Add historical file</h2>
            <input
              required
              placeholder="IPD number"
              value={newIpd}
              onChange={(e) => setNewIpd(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button type="submit" className="w-full rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white">
              Add
            </button>
          </form>
        </div>
      ) : null}

      {addMemberOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
          <button type="button" aria-label="Close" className="flex-1" onClick={() => setAddMemberOpen(false)} />
          <form onSubmit={handleAddMember} className="mx-auto w-full max-w-[430px] space-y-3 rounded-t-2xl bg-white p-5">
            <h2 className="text-lg font-semibold">Add MRD member</h2>
            <select
              required
              value={newMemberId}
              onChange={(e) => setNewMemberId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Select user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.staff_id})
                </option>
              ))}
            </select>
            <button type="submit" className="w-full rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white">
              Add
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
