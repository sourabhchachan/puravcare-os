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

export default function DashboardHomePage() {
  const { session, loading } = useAuth();

  const title = useMemo(() => {
    if (!session) return "Welcome";
    return greeting(session.full_name);
  }, [session]);

  if (loading || !session) return null;

  const cards = [
    { label: "Total Tasks Today", value: "0" },
    { label: "Overdue", value: "0" },
    { label: "Active Patients", value: "0" },
    { label: "Cash Balance", value: "0" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-transparent transition hover:ring-[#1A3C5E]/20"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-[#1A3C5E]">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
