import type { SessionUser } from "@/lib/auth/types";
import { SESSION_STORAGE_KEY } from "@/lib/auth/constants";

function parseSession(raw: string | null): SessionUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.id || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getStoredSession(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const local = parseSession(window.localStorage.getItem(SESSION_STORAGE_KEY));
  if (local) return local;
  return parseSession(window.sessionStorage.getItem(SESSION_STORAGE_KEY));
}

export function setStoredSession(session: SessionUser, keepSignedIn = true): void {
  if (typeof window === "undefined") return;
  const value = JSON.stringify(session);
  if (keepSignedIn) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, value);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, value);
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
