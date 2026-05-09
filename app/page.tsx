"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getStoredSession } from "@/lib/auth/storage";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const s = getStoredSession();
    if (!s) router.replace("/login");
    else if (s.must_change_password) router.replace("/change-password");
    else router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] text-sm text-slate-500">
      Loading…
    </div>
  );
}
