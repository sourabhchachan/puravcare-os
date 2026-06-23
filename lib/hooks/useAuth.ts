"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { SessionUser } from "@/lib/auth/types";
import { clearStoredSession, getStoredSession, setStoredSession } from "@/lib/auth/storage";

type UseAuthOptions = {
  /** Redirect to /login when no session */
  requireSession?: boolean;
  /** When on dashboard routes: redirect to /change-pin if user must reset PIN */
  enforcePinChange?: boolean;
  /** When on /change-pin: redirect to /dashboard if PIN change not required */
  pinChangeRoute?: boolean;
  /** @deprecated use enforcePinChange */
  enforcePasswordChange?: boolean;
  /** @deprecated use pinChangeRoute */
  passwordChangeRoute?: boolean;
};

export function useAuth(options: UseAuthOptions = {}) {
  const {
    requireSession = false,
    enforcePinChange = options.enforcePinChange ?? options.enforcePasswordChange ?? false,
    pinChangeRoute = options.pinChangeRoute ?? options.passwordChangeRoute ?? false,
  } = options;
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

    if (requireSession && session && pinChangeRoute && !session.must_change_password) {
      router.replace("/dashboard");
      return;
    }

    if (requireSession && session && enforcePinChange && session.must_change_password) {
      router.replace("/change-pin");
    }
  }, [loading, requireSession, enforcePinChange, pinChangeRoute, session, router]);

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
