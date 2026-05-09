"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F9FAFB] px-4 py-8">
      <div className="pc-card w-full max-w-[430px] text-center">
        <p className="pc-label">Something went wrong</p>
        <h1 className="mt-2 text-xl">Unexpected Error</h1>
        <p className="mt-2 text-sm text-gray-600">
          {error.message || "Connection error. Please try again."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="pc-btn-primary mt-5 w-full py-3 text-sm"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
