"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getStoredSession, setStoredSession } from "@/lib/auth/storage";
import type { SessionUser } from "@/lib/auth/types";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const existing = getStoredSession();
    if (!existing) return;
    if (existing.must_change_password) router.replace("/change-password");
    else router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login_id: loginId.trim(), password }),
      });

      const payload = (await res.json()) as {
        error?: string;
        user?: SessionUser;
      };

      if (!res.ok) {
        if (payload.error === "deactivated") {
          setError("Your account has been deactivated. Contact admin.");
        } else {
          setError("Invalid login ID or password");
        }
        return;
      }

      if (!payload.user) {
        setError("Invalid login ID or password");
        return;
      }

      setStoredSession(payload.user);

      if (payload.user.must_change_password) {
        router.replace("/change-password");
        return;
      }

      router.replace("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F9FAFB] px-4 py-8">
      <div className="w-full max-w-[430px] rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-[#2563EB]">PuravCare OS</h1>
        <p className="mt-1 text-center text-sm text-slate-600">Agastya Care, Gurgaon</p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="loginId">
              Login ID
            </label>
            <input
              id="loginId"
              inputMode="numeric"
              autoComplete="username"
              maxLength={10}
              minLength={10}
              value={loginId}
              onChange={(e) => setLoginId(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
              placeholder="Enter 10-digit login ID"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
              placeholder="Enter 6-digit password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>

          {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}
