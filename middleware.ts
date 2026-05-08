import { type NextRequest, NextResponse } from "next/server";

/**
 * Custom auth uses localStorage on the client — no server session cookie yet.
 * Route protection is handled by `useAuth()` in dashboard / change-password layouts.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|.*\\..*).*)"],
};
