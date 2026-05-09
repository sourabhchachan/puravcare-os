import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F9FAFB] px-4 py-8">
      <div className="pc-card w-full max-w-[430px] text-center">
        <p className="pc-label">404</p>
        <h1 className="mt-2 text-2xl">Page not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          The page you are trying to access does not exist.
        </p>
        <Link
          href="/dashboard"
          className="pc-btn-primary mt-5 block w-full py-3 text-sm"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
