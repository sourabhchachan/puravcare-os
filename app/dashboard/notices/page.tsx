"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

type Notice = {
  id: string;
  title: string;
  body: string | null;
  posted_by: string;
  created_at: string;
};

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function NoticesPage() {
  const { session, loading } = useAuth();
  const toast = useToast();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const canPost = session?.role === "ceo" || session?.role === "ops";

  const load = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    setLoadErr("");
    try {
      const res = await fetch("/api/notices", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { notices?: Notice[]; error?: string };
      if (!res.ok) {
        setLoadErr(data.error ?? "Could not load");
        toast.error(data.error ?? "Could not load");
        return;
      }
      setNotices(data.notices ?? []);
    } catch {
      setLoadErr("Could not load");
      toast.error("Could not load");
    } finally {
      setLoadingData(false);
    }
  }, [session, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !session) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Notices</h1>
          <p className="text-sm text-slate-500">Hospital notice board</p>
        </div>
        {canPost ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
          >
            New notice
          </button>
        ) : null}
      </div>

      {loadErr ? <p className="text-sm text-red-600">{loadErr}</p> : null}
      {loadingData ? <p className="text-sm text-slate-500">Loading…</p> : null}

      <ul className="space-y-3">
        {notices.map((n) => (
          <li key={n.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-900">{n.title}</h2>
            {n.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{n.body}</p> : null}
            <p className="mt-3 text-xs text-slate-500">
              {n.posted_by} · {formatDt(n.created_at)}
            </p>
          </li>
        ))}
      </ul>
      {!loadingData && notices.length === 0 ? <p className="text-sm text-slate-500">No notices yet.</p> : null}

      {sheetOpen && session && canPost ? (
        <CreateNoticeSheet
          sessionId={session.id}
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            setSheetOpen(false);
            toast.success("Notice posted");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateNoticeSheet({
  sessionId,
  onClose,
  onSaved,
}: {
  sessionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ title: title.trim(), body: body.trim() || null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        toast.error(data.error ?? "Could not save");
        return;
      }
      onSaved();
    } catch {
      setError("Could not save");
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">New notice</h2>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Post notice"}
          </button>
        </form>
      </div>
    </div>
  );
}
