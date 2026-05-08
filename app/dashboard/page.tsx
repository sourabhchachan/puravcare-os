"use client";

import { useMemo } from "react";

import { useAuth } from "@/lib/hooks/useAuth";

function greeting(name: string) {
  const hour = new Date().getHours();
  let part = "Good morning";
  if (hour >= 12 && hour < 17) part = "Good afternoon";
  else if (hour >= 17) part = "Good evening";
  const first = name.trim().split(/\s+/)[0] ?? name;
  return `${part}, ${first}`;
}

function IconClipboard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAlert({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRupee({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      ₹
    </span>
  );
}

const STAT_CARDS = [
  {
    label: "Total Tasks Today",
    value: "0",
    borderClass: "border-l-[#3B82F6]",
    bgClass: "bg-blue-50",
    iconClass: "absolute right-3 top-3 h-7 w-7 shrink-0 text-[#3B82F6]",
    Icon: IconClipboard,
  },
  {
    label: "Overdue",
    value: "0",
    borderClass: "border-l-[#EF4444]",
    bgClass: "bg-red-50",
    iconClass: "absolute right-3 top-3 h-7 w-7 shrink-0 text-[#EF4444]",
    Icon: IconAlert,
  },
  {
    label: "Active Patients",
    value: "0",
    borderClass: "border-l-[#10B981]",
    bgClass: "bg-green-50",
    iconClass: "absolute right-3 top-3 h-7 w-7 shrink-0 text-[#10B981]",
    Icon: IconUser,
  },
  {
    label: "Cash Balance",
    value: "0",
    borderClass: "border-l-[#F59E0B]",
    bgClass: "bg-amber-50",
    iconClass: "absolute right-3 top-2.5 text-2xl font-extrabold leading-none text-[#F59E0B]",
    Icon: IconRupee,
  },
] as const;

export default function DashboardHomePage() {
  const { session, loading } = useAuth();

  const title = useMemo(() => {
    if (!session) return "Welcome";
    return greeting(session.full_name);
  }, [session]);

  if (loading || !session) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>

      <div className="grid grid-cols-2 gap-3">
        {STAT_CARDS.map((card) => {
          const Icon = card.Icon;
          return (
            <div
              key={card.label}
              className={`relative overflow-hidden rounded-xl border border-y border-r border-slate-100/90 border-l-4 ${card.borderClass} ${card.bgClass} p-4 shadow-sm`}
            >
              <Icon className={card.iconClass} />
              <p className="pr-10 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600">
                {card.label}
              </p>
              <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{card.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
