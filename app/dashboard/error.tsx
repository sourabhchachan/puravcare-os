"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pc-card text-center">
      <p className="pc-label">Dashboard Error</p>
      <h2 className="mt-2 text-lg">Couldn&apos;t load this page</h2>
      <p className="mt-2 text-sm text-gray-600">
        {error.message || "Connection error. Please try again."}
      </p>
      <button type="button" onClick={reset} className="pc-btn-primary mt-4 w-full py-2.5 text-sm">
        Retry
      </button>
    </div>
  );
}
