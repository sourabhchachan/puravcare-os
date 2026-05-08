import Link from "next/link";

const tabs = [
  { href: "/pulse", label: "Pulse" },
  { href: "/tasks", label: "Tasks" },
  { href: "/cashbook", label: "Cashbook" },
  { href: "/master-bill", label: "Master Bill" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-200">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-white">
        <header className="flex items-center justify-between bg-[#1A3C5E] px-4 py-3 text-white">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-200">PuravCare OS</p>
            <h1 className="text-base font-semibold">Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Notifications"
              className="rounded-full bg-white/15 p-2 text-sm"
            >
              🔔
            </button>
            <button
              type="button"
              aria-label="Open profile menu"
              className="h-8 w-8 rounded-full bg-white font-semibold text-[#1A3C5E]"
            >
              S
            </button>
          </div>
        </header>

        <main className="flex-1 bg-white p-4">{children}</main>

        <nav className="grid grid-cols-4 border-t border-slate-200 bg-white">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="px-2 py-3 text-center text-xs font-medium text-slate-600"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
