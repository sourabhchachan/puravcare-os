"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type LoginRecord = {
  id: string;
  first_login: boolean;
  password_hash: string;
};

async function sha256Hex(value: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedLoginId = loginId.trim();
      const passwordHash = await sha256Hex(password);

      const { data, error: queryError } = await supabase
        .from("users")
        .select("id, first_login, password_hash")
        .eq("login_id", normalizedLoginId)
        .eq("active", true)
        .maybeSingle<LoginRecord>();

      if (queryError || !data || data.password_hash !== passwordHash) {
        setError("Invalid login ID or password.");
        setLoading(false);
        return;
      }

      if (data.first_login) {
        router.push("/change-password");
        return;
      }

      router.push("/pulse");
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center justify-center">
        <div className="w-full rounded-2xl bg-white p-6 shadow-lg">
          <h1 className="text-2xl font-bold text-[#1A3C5E]">PuravCare OS</h1>
          <p className="mt-1 text-sm text-slate-500">Hospital operating system</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="loginId">
                Login ID
              </label>
              <input
                id="loginId"
                inputMode="numeric"
                maxLength={10}
                minLength={10}
                pattern="\d{10}"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value.replace(/\D/g, ""))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
                placeholder="Enter 10-digit Login ID"
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
                maxLength={6}
                minLength={6}
                pattern="\d{6}"
                value={password}
                onChange={(event) => setPassword(event.target.value.replace(/\D/g, ""))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#1A3C5E] focus:ring-2"
                placeholder="Enter 6-digit password"
                required
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#1A3C5E] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
