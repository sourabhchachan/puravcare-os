"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/hooks/useAuth";

type PsiTab = "all" | "proposed" | "approved" | "rejected";

type PsiNode = {
  id: string;
  type: "problem" | "solution" | "indicator";
  title: string;
  description: string | null;
  parent_id: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  created_by_name: string;
};

type TreeNode = PsiNode & { children: TreeNode[] };

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: string) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  return "bg-yellow-100 text-yellow-900";
}

function buildTree(flat: PsiNode[]): TreeNode[] {
  const byParent = new Map<string | null, PsiNode[]>();
  for (const n of flat) {
    const key = n.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  function attach(parentId: string | null): TreeNode[] {
    return (byParent.get(parentId) ?? []).map((n) => ({
      ...n,
      children: attach(n.id),
    }));
  }
  return attach(null).filter((n) => n.type === "problem");
}

function subtreeMatchesTab(n: TreeNode, tab: PsiTab): boolean {
  if (tab === "all") return true;
  if (n.status === tab) return true;
  return n.children.some((c) => subtreeMatchesTab(c, tab));
}

function filterTree(nodes: TreeNode[], tab: PsiTab): TreeNode[] {
  return nodes
    .filter((p) => subtreeMatchesTab(p, tab))
    .map((p) => ({
      ...p,
      children: filterChildren(p.children, tab),
    }));
}

function filterChildren(nodes: TreeNode[], tab: PsiTab): TreeNode[] {
  if (tab === "all") return nodes;
  return nodes
    .filter((n) => subtreeMatchesTab(n, tab))
    .map((n) => ({
      ...n,
      children: filterChildren(n.children, tab),
    }));
}

export default function PsiPage() {
  const { session, loading } = useAuth();
  const [nodes, setNodes] = useState<PsiNode[]>([]);
  const [tab, setTab] = useState<PsiTab>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<{ kind: "problem" } | { kind: "solution" | "indicator"; parentId: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    setError("");
    try {
      const res = await fetch("/api/psi", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as { nodes?: PsiNode[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load PSI");
        return;
      }
      setNodes(data.nodes ?? []);
    } catch {
      setError("Could not load PSI");
    } finally {
      setLoadingData(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const visibleTree = useMemo(() => filterTree(tree, tab), [tree, tab]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const isOpen = prev[id] !== false;
      return { ...prev, [id]: !isOpen };
    });
  }

  if (loading || !session) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">PSI Framework</h1>
          <p className="text-sm text-slate-500">Problem → Solution → Indicator</p>
        </div>
        <button
          type="button"
          onClick={() => setSheet({ kind: "problem" })}
          className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
        >
          New Problem
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["proposed", "Proposed"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === id ? "bg-[#2563EB] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loadingData ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loadingData && visibleTree.length === 0 ? (
        <p className="text-sm text-slate-500">No nodes match this filter.</p>
      ) : null}

      <ul className="space-y-2">
        {visibleTree.map((n) => (
          <PsiTreeNode
            key={n.id}
            node={n}
            depth={0}
            expanded={expanded}
            onToggle={toggleExpand}
            session={session}
            onProposeSolution={() => setSheet({ kind: "solution", parentId: n.id })}
            onProposeIndicator={(solutionId) => setSheet({ kind: "indicator", parentId: solutionId })}
            onApproved={() => void load()}
          />
        ))}
      </ul>

      {sheet ? (
        <NewPsiSheet
          key={`${sheet.kind}-${"parentId" in sheet ? sheet.parentId : "root"}`}
          sessionId={session.id}
          kind={sheet.kind}
          parentId={"parentId" in sheet ? sheet.parentId : undefined}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function PsiTreeNode({
  node,
  depth,
  expanded,
  onToggle,
  session,
  onProposeSolution,
  onProposeIndicator,
  onApproved,
}: {
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  session: { id: string; role: string };
  onProposeSolution: () => void;
  onProposeIndicator: (solutionId: string) => void;
  onApproved: () => void;
}) {
  const isOpen = expanded[node.id] !== false;
  const pad = Math.min(depth * 12, 48);
  const isCeo = session.role === "ceo";

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm" style={{ marginLeft: pad }}>
      <div className="flex items-start gap-2 p-3">
        {node.children.length > 0 ? (
          <button
            type="button"
            className="mt-0.5 shrink-0 text-slate-500"
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={() => onToggle(node.id)}
          >
            {isOpen ? "▼" : "▶"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{node.type}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(node.status)}`}>
              {node.status}
            </span>
          </div>
          <p className="font-semibold text-slate-900">{node.title}</p>
          {node.description ? <p className="mt-1 text-xs text-slate-600">{node.description}</p> : null}
          <p className="mt-1 text-xs text-slate-500">
            {node.created_by_name} · {formatDt(node.created_at)}
          </p>
          {node.type === "problem" && node.status !== "rejected" ? (
            <button type="button" onClick={onProposeSolution} className="mt-2 text-xs font-medium text-[#2563EB]">
              + Propose solution
            </button>
          ) : null}
          {node.type === "solution" && node.status !== "rejected" ? (
            <button type="button" onClick={() => onProposeIndicator(node.id)} className="mt-2 text-xs font-medium text-[#2563EB]">
              + Propose indicator
            </button>
          ) : null}
          {isCeo && node.status === "proposed" ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                onClick={() => void approveNode(session.id, node.id, "approve", onApproved)}
              >
                Approve
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                onClick={() => void approveNode(session.id, node.id, "reject", onApproved)}
              >
                Reject
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {isOpen && node.children.length > 0 ? (
        <ul className="space-y-2 border-t border-slate-100 px-2 py-2">
          {node.children.map((c) => (
            <PsiTreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              session={session}
              onProposeSolution={() => {}}
              onProposeIndicator={onProposeIndicator}
              onApproved={onApproved}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

async function approveNode(actorId: string, nodeId: string, action: "approve" | "reject", onDone: () => void) {
  const res = await fetch(`/api/psi/${nodeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-actor-id": actorId },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) return;
  onDone();
}

function NewPsiSheet({
  sessionId,
  kind,
  parentId,
  onClose,
  onSaved,
}: {
  sessionId: string;
  kind: "problem" | "solution" | "indicator";
  parentId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/psi", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({
          type: kind,
          title,
          description,
          parent_id: kind === "problem" ? null : parentId,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      onSaved();
    } catch {
      setError("Could not save");
    } finally {
      setSaving(false);
    }
  }

  const heading =
    kind === "problem" ? "New problem" : kind === "solution" ? "Propose solution" : "Propose indicator";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">{heading}</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
