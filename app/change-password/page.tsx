"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/hooks/useAuth";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { session, loading, updateSession } = useAuth({
    requireSession: true,
    passwordChangeRoute: true,
  });

  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(nextPassword) || !/^\d{6}$/.test(confirm)) {
      setError("Passwords must be exactly 6 digits.");
      return;
    }
    if (nextPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (nextPassword === "000000") {
      setError("Password cannot be 000000.");
      return;
    }

    if (!session) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: session.id, new_password: nextPassword }),
      });

      if (!res.ok) {
        setError("Could not update password. Try again.");
        return;
      }

      updateSession({ ...session, must_change_password: false });
      router.replace("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-8">
      <div className="w-full max-w-[430px] rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-[#1A3C5E]">Change password</h1>
        <p className="mt-1 text-sm text-slate-600">Choose a new 6-digit password (not 000000).</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="np">
              New password
            </label>
            <input
              id="np"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
              placeholder="6 digits"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="cp">
              Confirm password
            </label>
            <input
              id="cp"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
              placeholder="6 digits"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#1A3C5E] py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save & continue"}
          </button>

          {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}
