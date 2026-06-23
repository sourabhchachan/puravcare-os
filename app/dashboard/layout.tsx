"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { ToastProvider, useToast } from "@/components/ui/ToastProvider";
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
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
  { href: "/dashboard/locations", label: "Locations" },
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
    enforcePinChange: true,
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [isMrdMember, setIsMrdMember] = useState(false);

  useEffect(() => {
    if (!session) {
      setIsMrdMember(false);
      return;
    }
    if (session.role === "ceo") {
      setIsMrdMember(true);
      return;
    }
    let cancelled = false;
    void fetch("/api/mrd/access", { headers: { "x-actor-id": session.id } })
      .then((r) => r.json())
      .then((d: { is_mrd_member?: boolean }) => {
        if (!cancelled) setIsMrdMember(Boolean(d.is_mrd_member));
      })
      .catch(() => {
        if (!cancelled) setIsMrdMember(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!profileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [profileOpen]);

  const tabs = useMemo(
    () => (session ? getDashboardTabs(session.role, { isMrdMember }) : []),
    [session, isMrdMember],
  );

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

        <main className="flex-1 overflow-y-auto scroll-smooth px-4 pt-4 pb-40 max-[430px]:pb-[calc(10rem+env(safe-area-inset-bottom,0px))]">
          {children}
        </main>

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
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Profile menu">
          <button
            type="button"
            aria-label="Close profile"
            className="absolute inset-0 bg-black/40"
            onClick={() => setProfileOpen(false)}
          />
          <div className="relative z-10 mx-auto flex max-h-[min(85vh,720px)] w-full max-w-[430px] flex-col rounded-t-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-[#2563EB]"
                onClick={() => setProfileOpen(false)}
              >
                ← Back to Dashboard
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setProfileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-5 pt-3">
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
              className="mt-4 w-full rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setProfileOpen(false);
                setChangePinOpen(true);
              }}
            >
              Change PIN
            </button>

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
        </div>
      ) : null}

      {changePinOpen && session ? (
        <ChangePinSheet sessionId={session.id} onClose={() => setChangePinOpen(false)} />
      ) : null}
      </div>
    </ToastProvider>
  );
}

function ChangePinSheet({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const toast = useToast();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin) || !/^\d{6}$/.test(confirmPin)) {
      setError("All PIN fields must be exactly 6 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PIN and confirmation do not match.");
      return;
    }
    if (newPin === "000000") {
      setError("PIN cannot be 000000.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-actor-id": sessionId },
        body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const msg =
          data.error === "wrong_pin"
            ? "Current PIN is incorrect."
            : data.error === "invalid_new_pin"
              ? "New PIN must be 6 digits and not 000000."
              : "Could not update PIN.";
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("PIN updated");
      onClose();
    } catch {
      setError("Could not update PIN.");
      toast.error("Could not update PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Change PIN">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="text-lg font-semibold text-[#2563EB]">Change PIN</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Current PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Confirm new PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Update PIN"}
          </button>
        </form>
      </div>
    </div>
  );
}
