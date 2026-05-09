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

function longDateLabel() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUserPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M19 8v6M16 11h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PulseCard({
  href,
  icon,
  iconTone,
  label,
  value,
  valueClassName,
}: {
  href: string;
  icon: React.ReactNode;
  iconTone: string;
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-md transition hover:-translate-y-0.5">
      <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconTone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-4xl font-black leading-none ${valueClassName ?? "text-[#111827]"}`}>{value}</p>
        <p className="mt-1 text-sm text-gray-500">{label}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-300" />
    </Link>
  );
}

type Pulse = {
  tasks_today: number;
  overdue: number;
  active_patients: number;
  cash_balance: number;
  tasks_unlinked_psi: number;
};

type HomeMetrics = {
  my_open_tasks: number;
  overdue_tasks: number;
  active_patients?: number;
  my_cashbooks?: number;
  tasks_completed_today?: number;
};

export default function DashboardHomePage() {
  const { session, loading } = useAuth();
  const toast = useToast();
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [home, setHome] = useState<HomeMetrics | null>(null);

  const title = useMemo(() => {
    if (!session) return "Welcome";
    return greeting(session.full_name);
  }, [session]);
  const dateLabel = useMemo(() => longDateLabel(), []);

  const loadPulse = useCallback(async () => {
    if (!session) return;
    try {
      const url = session.role === "ceo" ? "/api/dashboard/pulse" : "/api/dashboard/home";
      const res = await fetch(url, { headers: { "x-actor-id": session.id } });
      const data = (await res.json()) as (Pulse & HomeMetrics) & { error?: string };
      if (!res.ok) {
        toast.error("Could not load dashboard metrics");
        return;
      }
      if (session.role === "ceo") {
        setPulse({
          tasks_today: data.tasks_today,
          overdue: data.overdue,
          active_patients: data.active_patients,
          cash_balance: data.cash_balance,
          tasks_unlinked_psi: data.tasks_unlinked_psi,
        });
        setHome(null);
        return;
      }
      setHome({
        my_open_tasks: data.my_open_tasks,
        overdue_tasks: data.overdue_tasks,
        active_patients: data.active_patients,
        my_cashbooks: data.my_cashbooks,
        tasks_completed_today: data.tasks_completed_today,
      });
      setPulse(null);
    } catch {
      toast.error("Could not load dashboard metrics");
    }
  }, [session, toast]);

  useEffect(() => {
    void loadPulse();
  }, [loadPulse]);

  if (loading || !session) return null;

  const p = pulse;
  const h = home;

  if (session.role === "ceo") {
    return (
      <div className="space-y-5">
        <section className="-mx-4 rounded-b-3xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-5">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1 text-sm text-blue-200">{dateLabel}</p>
        </section>

        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Hospital Overview</p>

        <div className="space-y-3">
          <PulseCard
            href="/dashboard/tasks"
            icon={<IconClipboard className="h-6 w-6 text-white" />}
            iconTone="bg-gradient-to-br from-blue-500 to-blue-700"
            label="Total Tasks Today"
            value={p ? p.tasks_today : "—"}
          />
          <PulseCard
            href="/dashboard/tasks?filter=overdue"
            icon={<IconAlert className="h-6 w-6 text-white" />}
            iconTone="bg-gradient-to-br from-red-500 to-red-700"
            label="Overdue"
            value={p ? p.overdue : "—"}
            valueClassName={p && p.overdue > 0 ? "text-[#EF4444]" : "text-gray-400"}
          />
          <PulseCard
            href="/dashboard/patients"
            icon={<IconUser className="h-6 w-6 text-white" />}
            iconTone="bg-gradient-to-br from-green-500 to-green-700"
            label="Active Patients"
            value={p ? p.active_patients : "—"}
          />
          <PulseCard
            href="/dashboard/cashbook"
            icon={<IconRupee className="text-xl font-bold text-white" />}
            iconTone="bg-gradient-to-br from-amber-400 to-amber-600"
            label="Cash Balance"
            value={p ? formatInr(p.cash_balance) : "—"}
          />
          <PulseCard
            href="/dashboard/tasks?filter=unlinked"
            icon={<IconUnlinked className="h-6 w-6 text-white" />}
            iconTone="bg-gradient-to-br from-orange-400 to-orange-600"
            label="Tasks Unlinked to PSI"
            value={p ? p.tasks_unlinked_psi : "—"}
            valueClassName={p && p.tasks_unlinked_psi > 0 ? "text-[#F59E0B]" : "text-gray-400"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <Link
            href="/dashboard/tasks/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-50 py-3 text-sm font-semibold text-blue-600"
          >
            <IconPlus className="h-4 w-4" />
            New Task
          </Link>
          <Link
            href="/dashboard/patients/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-50 py-3 text-sm font-semibold text-blue-600"
          >
            <IconUserPlus className="h-4 w-4" />
            New Patient
          </Link>
        </div>
      </div>
    );
  }

  if (session.role === "ops") {
    return (
      <div className="space-y-5">
        <section className="-mx-4 rounded-b-3xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-5">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1 text-sm text-blue-200">{dateLabel}</p>
        </section>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Operations Overview</p>
        <div className="space-y-3">
          <PulseCard
            href="/dashboard/tasks"
            icon={<IconClipboard className="h-6 w-6 text-white" />}
            iconTone="bg-gradient-to-br from-blue-500 to-blue-700"
            label="My Open Tasks"
            value={h ? h.my_open_tasks : "—"}
          />
          <PulseCard
            href="/dashboard/tasks?filter=overdue"
            icon={<IconAlert className="h-6 w-6 text-white" />}
            iconTone="bg-gradient-to-br from-red-500 to-red-700"
            label="Overdue Tasks"
            value={h ? h.overdue_tasks : "—"}
            valueClassName={h && h.overdue_tasks > 0 ? "text-[#EF4444]" : "text-gray-400"}
          />
          <PulseCard
            href="/dashboard/patients"
            icon={<IconUser className="h-6 w-6 text-white" />}
            iconTone="bg-gradient-to-br from-green-500 to-green-700"
            label="Active Patients"
            value={h ? (h.active_patients ?? 0) : "—"}
          />
          <PulseCard
            href="/dashboard/cashbook"
            icon={<IconRupee className="text-xl font-bold text-white" />}
            iconTone="bg-gradient-to-br from-amber-400 to-amber-600"
            label="My Cashbooks"
            value={h ? (h.my_cashbooks ?? 0) : "—"}
          />
        </div>
      </div>
    );
  }

  if (session.role === "staff") {
    return (
      <div className="space-y-5">
        <section className="-mx-4 rounded-b-3xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-5">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1 text-sm text-blue-200">{dateLabel}</p>
        </section>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">My Work Overview</p>
        <div className="space-y-3">
          <PulseCard
            href="/dashboard/tasks"
            icon={<IconClipboard className="h-6 w-6 text-white" />}
            iconTone="bg-gradient-to-br from-blue-500 to-blue-700"
            label="My Open Tasks"
            value={h ? h.my_open_tasks : "—"}
          />
          <PulseCard
            href="/dashboard/tasks?filter=overdue"
            icon={<IconAlert className="h-6 w-6 text-white" />}
            iconTone="bg-gradient-to-br from-red-500 to-red-700"
            label="Overdue Tasks"
            value={h ? h.overdue_tasks : "—"}
            valueClassName={h && h.overdue_tasks > 0 ? "text-[#EF4444]" : "text-gray-400"}
          />
          <PulseCard
            href="/dashboard/tasks"
            icon={<IconUnlinked className="h-6 w-6 text-white" />}
            iconTone="bg-gradient-to-br from-green-500 to-green-700"
            label="Tasks Completed Today"
            value={h ? (h.tasks_completed_today ?? 0) : "—"}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-600">Use the bottom navigation and profile menu for your workspace.</p>
    </div>
  );
}
