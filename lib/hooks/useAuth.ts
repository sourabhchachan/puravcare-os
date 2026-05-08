"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { SessionUser } from "@/lib/auth/types";
import { clearStoredSession, getStoredSession, setStoredSession } from "@/lib/auth/storage";

type UseAuthOptions = {
  /** Redirect to /login when no session */
  requireSession?: boolean;
  /** When on dashboard routes: redirect to /change-password if user must reset password */
  enforcePasswordChange?: boolean;
  /** When on /change-password: redirect to /dashboard if password change not required */
  passwordChangeRoute?: boolean;
};

export function useAuth(options: UseAuthOptions = {}) {
  const { requireSession = false, enforcePasswordChange = false, passwordChangeRoute = false } = options;
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setSession(getStoredSession());
  }, []);

  useEffect(() => {
    refresh();
    setLoading(false);
  }, [pathname, refresh]);

  useEffect(() => {
    if (loading) return;

    if (requireSession && !session) {
      router.replace("/login");
      return;
    }

    if (requireSession && session && passwordChangeRoute && !session.must_change_password) {
      router.replace("/dashboard");
      return;
    }

    if (requireSession && session && enforcePasswordChange && session.must_change_password) {
      router.replace("/change-password");
    }
  }, [loading, requireSession, enforcePasswordChange, passwordChangeRoute, session, router]);

  const signOut = useCallback(() => {
    clearStoredSession();
    setSession(null);
    router.replace("/login");
  }, [router]);

  const updateSession = useCallback((next: SessionUser) => {
    setStoredSession(next);
    setSession(next);
  }, []);

  return useMemo(
    () => ({
      session,
      loading,
      signOut,
      refresh,
      updateSession,
    }),
    [session, loading, signOut, refresh, updateSession],
  );
}
