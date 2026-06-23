"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ToastProvider, useToast } from "@/components/ui/ToastProvider";
import { getStoredSession, setStoredSession } from "@/lib/auth/storage";
import type { SessionUser } from "@/lib/auth/types";

export default function LoginPage() {
  return (
    <ToastProvider>
      <LoginPageScreen />
    </ToastProvider>
  );
}

function LoginPageScreen() {
  const router = useRouter();
  const toast = useToast();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const existing = getStoredSession();
    if (!existing) return;
    if (existing.must_change_password) router.replace("/change-pin");
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
          toast.error("Account deactivated");
        } else {
          setError("Invalid login ID or password");
          toast.error("Invalid login ID or password");
        }
        return;
      }

      if (!payload.user) {
        setError("Invalid login ID or password");
        toast.error("Invalid login ID or password");
        return;
      }

      setStoredSession(payload.user, keepSignedIn);
      const first = payload.user.full_name.trim().split(/\s+/)[0] ?? payload.user.full_name;
      window.sessionStorage.setItem("pc_welcome_toast_name", first);
      toast.success(`Welcome back, ${first}`);

      if (payload.user.must_change_password) {
        router.replace("/change-pin");
        return;
      }

      router.replace("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-[#F9FAFB] px-4 py-8">
      <div className="w-full max-w-[430px] rounded-2xl border border-gray-100 bg-white p-6 shadow-xl">
        <h1 className="text-center text-2xl font-bold tracking-tight text-gray-900">PuravCare OS</h1>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="pc-label mb-1 block" htmlFor="loginId">
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
              className="w-full px-3 py-2.5 text-sm"
              placeholder="Enter 10-digit login ID"
              required
            />
          </div>

          <div>
            <label className="pc-label mb-1 block" htmlFor="password">
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
              className="w-full px-3 py-2.5 text-sm"
              placeholder="Enter 6-digit password"
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600" htmlFor="keepSignedIn">
            <input
              id="keepSignedIn"
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            Keep me signed in
          </label>

          <button
            type="submit"
            disabled={loading}
            className="pc-btn-primary w-full py-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>

          {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}
