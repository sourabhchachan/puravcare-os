"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { NotificationBell } from "@/components/dashboard/NotificationBell";
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

const ceoLinks = [
  { href: "/dashboard/users", label: "User Management" },
  { href: "/dashboard/task-master", label: "Task Master" },
  { href: "/dashboard/item-master", label: "Item Master" },
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
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-[#F9FAFB] shadow-sm">
        <header className="flex shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-[#2563EB] to-[#3B82F6] px-4 py-3 text-white">
          <span className="min-w-0 shrink text-base font-semibold">PuravCare OS</span>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell actorId={session.id} />
            <button
              type="button"
              aria-label="Profile"
              onClick={() => setProfileOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-sm font-semibold text-white ring-2 ring-white"
            >
              {initials(session.full_name)}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">{children}</main>

        <nav
          className={`fixed bottom-0 left-1/2 z-40 grid w-full max-w-[430px] -translate-x-1/2 border-t border-slate-200 bg-white shadow-[0_-4px_12px_rgba(15,23,42,0.08)] ${gridColsClass(tabs.length)}`}
        >
          {tabs.map((tab) => {
            const active = isTabActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${
                  active ? "text-[#2563EB]" : "text-slate-500"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "text-[#2563EB]" : "text-slate-400"}`} />
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
          <div className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-lg">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <p className="text-lg font-semibold text-slate-900">{session.full_name}</p>
            <p className="text-sm text-slate-500">
              {roleLabel(session.role)} · Staff {session.staff_id}
            </p>

            <div className="mt-4 space-y-1 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Operations</p>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/dashboard/psi"
                    className="block rounded-lg px-3 py-2 text-sm text-[#2563EB] hover:bg-slate-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    PSI Framework
                  </Link>
                </li>
                <li>
                  <Link
                    href="/dashboard/chain-templates"
                    className="block rounded-lg px-3 py-2 text-sm text-[#2563EB] hover:bg-slate-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    Chain Templates
                  </Link>
                </li>
                {(session.role === "ceo" || session.role === "ops") && (
                  <li>
                    <Link
                      href="/dashboard/vendors"
                      className="block rounded-lg px-3 py-2 text-sm text-[#2563EB] hover:bg-slate-50"
                      onClick={() => setProfileOpen(false)}
                    >
                      Vendors
                    </Link>
                  </li>
                )}
                <li>
                  <Link
                    href="/dashboard/my-work"
                    className="block rounded-lg px-3 py-2 text-sm text-[#2563EB] hover:bg-slate-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    My work
                  </Link>
                </li>
                <li>
                  <Link
                    href="/dashboard/notices"
                    className="block rounded-lg px-3 py-2 text-sm text-[#2563EB] hover:bg-slate-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    Notices
                  </Link>
                </li>
              </ul>
            </div>

            {session.role === "ceo" ? (
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Admin</p>
                <ul className="space-y-1">
                  {ceoLinks.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block rounded-lg px-3 py-2 text-sm text-[#2563EB] hover:bg-slate-50"
                        onClick={() => setProfileOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {session.role !== "ceo" && session.can_create_items ? (
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Master data</p>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/dashboard/item-master"
                      className="block rounded-lg px-3 py-2 text-sm text-[#2563EB] hover:bg-slate-50"
                      onClick={() => setProfileOpen(false)}
                    >
                      Item Master
                    </Link>
                  </li>
                </ul>
              </div>
            ) : null}

            <button
              type="button"
              className="mt-6 w-full rounded-lg border border-slate-200 py-3 text-sm font-semibold text-slate-700"
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
  );
}
