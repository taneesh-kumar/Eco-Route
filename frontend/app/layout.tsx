import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoRoute - Foundation",
  description: "Carbon-Aware Cloud Workload Scheduler Technical Foundation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col bg-[#0b0f17] text-slate-100">
        <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight text-emerald-400">🌱 EcoRoute</span>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
              Phase 1: Foundation
            </span>
          </div>
          <div className="text-xs text-slate-400">
            FastAPI + PostgreSQL + Redis
          </div>
        </header>
        <main className="flex-1 max-w-5xl w-full mx-auto p-6">{children}</main>
        <footer className="border-t border-slate-800 px-6 py-4 text-center text-xs text-slate-500">
          EcoRoute Carbon-Aware Scheduler &bull; System Foundation Verified
        </footer>
      </body>
    </html>
  );
}
