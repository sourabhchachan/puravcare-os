"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

function greeting(name: string) {
  const hour = new Date().getHours();
  let part = "Good morning";
  if (hour >= 12 && hour < 17) part = "Good afternoon";
  else if (hour >= 17) part = "Good evening";
  const first = name.trim().split(/\s+/)[0] ?? name;
  return `${part}, ${first}`;
}

function formatInr(n: number) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
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

function IconUnlinked({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10 14a4 4 0 010-6l1-1M14 10a4 4 0 010 6l-1 1M7 21l10-10M17 3L7 13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Pulse = {
  tasks_today: number;
  overdue: number;
  active_patients: number;
  cash_balance: number;
  tasks_unlinked_psi: number;
};

export default function DashboardHomePage() {
  const { session, loading } = useAuth();
  const toast = useToast();
  const [pulse, setPulse] = useState<Pulse | null>(null);

  const title = useMemo(() => {
    if (!session) return "Welcome";
    return greeting(session.full_name);
  }, [session]);

  const loadPulse = useCallback(async () => {
    if (!session || session.role !== "ceo") return;
    try {
      const res = await fetch("/api/dashboard/pulse", { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as Pulse & { error?: string };
      if (!res.ok) {
        toast.error("Could not load pulse metrics");
        return;
      }
      setPulse({
        tasks_today: data.tasks_today,
        overdue: data.overdue,
        active_patients: data.active_patients,
        cash_balance: data.cash_balance,
        tasks_unlinked_psi: data.tasks_unlinked_psi,
      });
    } catch {
      toast.error("Could not load pulse metrics");
    }
  }, [session, toast]);

  useEffect(() => {
    void loadPulse();
  }, [loadPulse]);

  if (loading || !session) return null;

  if (session.role !== "ceo") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">Use the bottom navigation and profile menu for your workspace.</p>
      </div>
    );
  }

  const p = pulse;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/tasks"
          className="relative block overflow-hidden rounded-xl border border-y border-r border-slate-100/90 border-l-4 border-l-[#3B82F6] bg-blue-50 p-4 shadow-sm transition hover:opacity-95"
        >
          <IconClipboard className="absolute right-3 top-3 h-7 w-7 shrink-0 text-[#3B82F6]" />
          <p className="pr-10 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600">Total Tasks Today</p>
          <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{p ? p.tasks_today : "—"}</p>
        </Link>

        <Link
          href="/dashboard/tasks?filter=overdue"
          className="relative block overflow-hidden rounded-xl border border-y border-r border-slate-100/90 border-l-4 border-l-[#EF4444] bg-red-50 p-4 shadow-sm transition hover:opacity-95"
        >
          <IconAlert className="absolute right-3 top-3 h-7 w-7 shrink-0 text-[#EF4444]" />
          <p className="pr-10 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600">Overdue</p>
          <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{p ? p.overdue : "—"}</p>
        </Link>

        <Link
          href="/dashboard/patients"
          className="relative block overflow-hidden rounded-xl border border-y border-r border-slate-100/90 border-l-4 border-l-[#10B981] bg-green-50 p-4 shadow-sm transition hover:opacity-95"
        >
          <IconUser className="absolute right-3 top-3 h-7 w-7 shrink-0 text-[#10B981]" />
          <p className="pr-10 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600">Active Patients</p>
          <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{p ? p.active_patients : "—"}</p>
        </Link>

        <Link
          href="/dashboard/cashbook"
          className="relative block overflow-hidden rounded-xl border border-y border-r border-slate-100/90 border-l-4 border-l-[#F59E0B] bg-amber-50 p-4 shadow-sm transition hover:opacity-95"
        >
          <IconRupee className="absolute right-3 top-2.5 text-2xl font-extrabold leading-none text-[#F59E0B]" />
          <p className="pr-10 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600">Cash Balance</p>
          <p className="mt-3 text-lg font-bold tabular-nums leading-tight text-slate-900">{p ? formatInr(p.cash_balance) : "—"}</p>
        </Link>

        <Link
          href="/dashboard/tasks?filter=unlinked"
          className="relative col-span-2 block overflow-hidden rounded-xl border border-y border-r border-slate-100/90 border-l-4 border-l-[#F59E0B] bg-amber-50 p-4 shadow-sm transition hover:opacity-95"
        >
          <IconUnlinked className="absolute right-3 top-3 h-7 w-7 shrink-0 text-[#F59E0B]" />
          <p className="pr-10 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600">Tasks Unlinked to PSI</p>
          <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{p ? p.tasks_unlinked_psi : "—"}</p>
        </Link>
      </div>
    </div>
  );
}
