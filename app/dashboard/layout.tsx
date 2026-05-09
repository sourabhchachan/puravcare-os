"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";
import { getDashboardTabs, isTabActive } from "@/lib/dashboard/tabs";

function roleLabel(role: string) {
  const map: Record<string, string> = {
    ceo: "CEO",
    ops: "Ops",
    staff: "Staff",
    vendor: "Vendor",
  };
  return map[role] ?? role;
}

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : (parts[0][1] ?? "");
  return `${first}${last}`.toUpperCase();
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ceoLinks = [
  { href: "/dashboard/users", label: "User Management" },
  { href: "/dashboard/task-master", label: "Task Master" },
  { href: "/dashboard/item-master", label: "Item Master" },
  { href: "/dashboard/categories", label: "Categories" },
  { href: "/dashboard/payment-methods", label: "Payment Methods" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/audit-log", label: "Audit Log" },
] as const;

function gridColsClass(count: number) {
  if (count <= 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-3";
  if (count === 4) return "grid-cols-4";
  return "grid-cols-5";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, loading, signOut } = useAuth({
    requireSession: true,
    enforcePasswordChange: true,
  });
  const [profileOpen, setProfileOpen] = useState(false);

  const tabs = useMemo(() => (session ? getDashboardTabs(session.role) : []), [session]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#F9FAFB]">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-[#F9FAFB] shadow-sm">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white px-4 py-3">
          <span className="min-w-0 shrink text-base font-semibold text-[#111827]">PuravCare OS</span>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell actorId={session.id} />
            <button
              type="button"
              aria-label="Profile"
              onClick={() => setProfileOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-sm font-semibold text-[#6B7280]"
            >
              {initials(session.full_name)}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scroll-smooth px-4 pb-24 pt-4">{children}</main>

        <nav
          className={`fixed bottom-0 left-1/2 z-40 grid w-full max-w-[430px] -translate-x-1/2 border-t border-[#E5E7EB] bg-white ${gridColsClass(tabs.length)}`}
        >
          {tabs.map((tab) => {
            const active = isTabActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${
                  active ? "text-[#2563EB]" : "text-[#9CA3AF]"
                }`}
              >
                {active ? <span className="absolute left-2 right-2 top-0 h-0.5 rounded-full bg-[#2563EB]" /> : null}
                <Icon className={`h-5 w-5 ${active ? "text-[#2563EB]" : "text-[#9CA3AF]"}`} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {profileOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" role="presentation">
          <button
            type="button"
            aria-label="Close profile"
            className="flex-1"
            onClick={() => setProfileOpen(false)}
          />
          <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <p className="text-lg font-semibold text-slate-900">{session.full_name}</p>
            <p className="text-sm text-slate-500">
              {roleLabel(session.role)} · Staff {session.staff_id}
            </p>

            <div className="mt-4 space-y-1 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Operations</p>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/dashboard/psi"
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    PSI Framework
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/dashboard/chain-templates"
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    Chain Templates
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                </li>
                {(session.role === "ceo" || session.role === "ops") && (
                  <li>
                    <Link
                      href="/dashboard/vendors"
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                      onClick={() => setProfileOpen(false)}
                    >
                      Vendors
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Link>
                  </li>
                )}
                <li>
                  <Link
                    href="/dashboard/my-work"
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    My work
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/dashboard/notices"
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    Notices
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                </li>
                {session.role === "ops" ? (
                  <li>
                    <Link
                      href="/dashboard/customers"
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                      onClick={() => setProfileOpen(false)}
                    >
                      Customers
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Link>
                  </li>
                ) : null}
              </ul>
            </div>

            {session.role === "ceo" ? (
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Admin</p>
                <ul className="space-y-1">
                  {ceoLinks.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                        onClick={() => setProfileOpen(false)}
                      >
                        {item.label}
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {session.role !== "ceo" && session.can_create_items ? (
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Master data</p>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/dashboard/item-master"
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                      onClick={() => setProfileOpen(false)}
                    >
                      Item Master
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Link>
                  </li>
                </ul>
              </div>
            ) : null}

            <button
              type="button"
              className="mt-6 w-full rounded-xl py-3 text-sm font-semibold text-red-500 hover:bg-red-50"
              onClick={() => {
                setProfileOpen(false);
                signOut();
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </ToastProvider>
  );
}
