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

function PulseCard({
  href,
  icon,
  iconTone,
  label,
  value,
}: {
  href: string;
  icon: React.ReactNode;
  iconTone: string;
  label: string;
  value: string | number;
}) {
  return (
    <Link href={href} className="pc-card block transition hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconTone}`}>{icon}</span>
      </div>
      <p className="mt-3 text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
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
        <PulseCard
          href="/dashboard/tasks"
          icon={<IconClipboard className="h-5 w-5 text-blue-600" />}
          iconTone="bg-blue-100"
          label="Total Tasks Today"
          value={p ? p.tasks_today : "—"}
        />
        <PulseCard
          href="/dashboard/tasks?filter=overdue"
          icon={<IconAlert className="h-5 w-5 text-red-600" />}
          iconTone="bg-red-100"
          label="Overdue"
          value={p ? p.overdue : "—"}
        />
        <PulseCard
          href="/dashboard/patients"
          icon={<IconUser className="h-5 w-5 text-green-600" />}
          iconTone="bg-green-100"
          label="Active Patients"
          value={p ? p.active_patients : "—"}
        />
        <PulseCard
          href="/dashboard/cashbook"
          icon={<IconRupee className="text-base font-bold text-amber-600" />}
          iconTone="bg-amber-100"
          label="Cash Balance"
          value={p ? formatInr(p.cash_balance) : "—"}
        />
        <div className="col-span-2">
          <PulseCard
            href="/dashboard/tasks?filter=unlinked"
            icon={<IconUnlinked className="h-5 w-5 text-orange-600" />}
            iconTone="bg-orange-100"
            label="Tasks Unlinked to PSI"
            value={p ? p.tasks_unlinked_psi : "—"}
          />
        </div>
      </div>
    </div>
  );
}
