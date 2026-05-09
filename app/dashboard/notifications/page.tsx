"use client";

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type Row = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  related_task_id: string | null;
};

const NOTICE_POSTED_BY_SEP = " — Posted by: ";

/** Split notice notification body into preview + author (new format); legacy rows return preview only. */
function splitNoticeNotificationBody(body: string | null): { preview: string | null; postedBy: string | null } {
  if (!body?.trim()) return { preview: null, postedBy: null };
  const i = body.lastIndexOf(NOTICE_POSTED_BY_SEP);
  if (i === -1) return { preview: body, postedBy: null };
  return {
    preview: body.slice(0, i).trim() || null,
    postedBy: body.slice(i + NOTICE_POSTED_BY_SEP.length).trim() || null,
  };
}

function NoticeNotificationLines({ body }: { body: string }) {
  const { preview, postedBy } = splitNoticeNotificationBody(body);
  if (postedBy) {
    return (
      <>
        {preview ? <p className="mt-1 text-sm text-slate-600">{preview}</p> : null}
        <p className="mt-1 text-xs font-medium text-slate-700">Posted by: {postedBy}</p>
      </>
    );
  }
  return <p className="mt-1 text-sm text-slate-600">{body}</p>;
}

function timeAgo(iso: string) {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationsPage() {
  const { session, loading } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    setErr("");
    try {
      const res = await fetch("/api/notifications", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { notifications?: Row[]; error?: string };
      if (!res.ok) {
        setErr(data.error ?? "Could not load");
        toast.error("Could not load notifications");
        return;
      }
      setRows(data.notifications ?? []);
    } catch {
      setErr("Could not load");
      toast.error("Could not load notifications");
    } finally {
      setLoadingData(false);
    }
  }, [session, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    if (!session) return;
    const res = await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-actor-id": session.id },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      toast.error("Could not update");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_read: true } : r)));
  }

  async function markAllRead() {
    if (!session) return;
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-id": session.id },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    if (!res.ok) {
      toast.error("Could not mark all read");
      return;
    }
    toast.success("All notifications marked read");
    setRows((prev) => prev.map((r) => ({ ...r, is_read: true })));
  }

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
        <button
          type="button"
          onClick={() => void markAllRead()}
          className="shrink-0 text-xs font-semibold text-[#2563EB]"
        >
          Mark all read
        </button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loadingData ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loadingData && rows.length === 0 ? <p className="text-sm text-slate-500">No notifications yet.</p> : null}

      <ul className="space-y-2">
        {rows.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => void markRead(n.id)}
              className={`w-full rounded-xl border p-4 text-left shadow-sm transition ${
                n.is_read ? "border-slate-100 bg-white" : "border-[#2563EB]/30 bg-blue-50/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{n.title}</p>
                {!n.is_read ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#2563EB]" aria-hidden /> : null}
              </div>
              {n.type === "notice" && n.body ? (
                <NoticeNotificationLines body={n.body} />
              ) : n.body ? (
                <p className="mt-1 text-sm text-slate-600">{n.body}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">{timeAgo(n.created_at)}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
