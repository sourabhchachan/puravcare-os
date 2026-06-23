"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { ToastProvider, useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

export default function ChangePinPage() {
  return (
    <ToastProvider>
      <ChangePinScreen />
    </ToastProvider>
  );
}

function ChangePinScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session, loading, updateSession } = useAuth({
    requireSession: true,
    pinChangeRoute: true,
  });

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

    if (!session) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": session.id,
        },
        body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const msg =
          data.error === "wrong_pin"
            ? "Current PIN is incorrect."
            : data.error === "invalid_new_pin"
              ? "New PIN must be 6 digits and not 000000."
              : "Could not update PIN. Try again.";
        setError(msg);
        toast.error(msg);
        return;
      }

      updateSession({ ...session, must_change_password: false });
      toast.success("PIN updated");
      router.replace("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F9FAFB] px-4 py-8">
      <div className="w-full max-w-[430px] rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-[#2563EB]">Change PIN</h1>
        <p className="mt-1 text-sm text-slate-600">
          You must set a new 6-digit PIN before continuing. Default PIN 000000 is not allowed.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="current-pin">
              Current PIN
            </label>
            <input
              id="current-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
              placeholder="6 digits"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="new-pin">
              New PIN
            </label>
            <input
              id="new-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
              placeholder="6 digits"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="confirm-pin">
              Confirm new PIN
            </label>
            <input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
              placeholder="6 digits"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save & continue"}
          </button>

          {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}
