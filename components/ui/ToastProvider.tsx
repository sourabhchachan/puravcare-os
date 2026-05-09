"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type ToastKind = "success" | "error" | "warning" | "info";

type Toast = { id: string; kind: ToastKind; message: string };

export type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function toastBg(kind: ToastKind) {
  switch (kind) {
    case "success":
      return "bg-emerald-600";
    case "error":
      return "bg-red-600";
    case "warning":
      return "bg-amber-500";
    case "info":
      return "bg-[#2563EB]";
    default:
      return "bg-slate-700";
  }
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const push = useCallback((kind: ToastKind, message: string) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, kind, message }]);
    const tid = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, 3000);
    timers.current.set(id, tid);
  }, []);

  const value = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      warning: (m) => push("warning", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed left-1/2 top-4 z-[1000] flex w-[min(100%,24rem)] -translate-x-1/2 flex-col items-stretch gap-2 px-3"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg px-4 py-3 text-center text-sm font-medium text-white shadow-lg ${toastBg(t.kind)}`}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
