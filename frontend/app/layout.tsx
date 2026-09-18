import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "EcoRoute — Carbon-Aware Cloud Workload Scheduling Platform",
  description:
    "Intelligent Multi-Objective Workload Dispatching with Zero-Carbon Fabrication, Real-Time Grid Telemetry, and Mathematical Decision Explainability.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-[#090d16] text-slate-100 flex flex-row overflow-x-hidden font-sans">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <header className="h-16 border-b border-slate-800/80 bg-[#0c101c]/80 backdrop-blur px-8 flex items-center justify-between sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-200">
                Carbon-Aware Orchestration Engine
              </span>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                Active &bull; Simulated Multi-Region
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
              <span className="hidden sm:inline">Zero Fabrication Policy: Active</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            </div>
          </header>

          <main className="flex-1 p-8 max-w-7xl w-full mx-auto space-y-8">
            {children}
          </main>

          <footer className="border-t border-slate-800/60 px-8 py-4 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 bg-[#090d16]">
            <span>EcoRoute Platform &bull; Academic Carbon-Aware Scheduling System</span>
            <span className="font-mono">FastAPI &bull; Next.js 16 &bull; Supabase &bull; Upstash</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
