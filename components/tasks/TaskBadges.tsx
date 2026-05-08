const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 ring-1 ring-red-200",
  high: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  normal: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  low: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-900 ring-1 ring-yellow-200",
  acknowledged: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  in_progress: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  done: "bg-green-100 text-green-800 ring-1 ring-green-200",
  confirmed: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  closed: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  blocked: "bg-red-100 text-red-800 ring-1 ring-red-200",
};

export function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.normal;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {priority}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function priorityBorderClass(priority: string) {
  switch (priority) {
    case "critical":
      return "border-l-red-500";
    case "high":
      return "border-l-orange-500";
    case "normal":
      return "border-l-blue-500";
    case "low":
      return "border-l-slate-400";
    default:
      return "border-l-blue-400";
  }
}
