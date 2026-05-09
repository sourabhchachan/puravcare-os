"use client";

export default function RootLoading() {
  return (
    <main className="min-h-screen bg-[#F9FAFB] px-4 py-8">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <div className="pc-skeleton h-24" />
        <div className="pc-skeleton h-24" />
        <div className="pc-skeleton h-24" />
      </div>
    </main>
  );
}
