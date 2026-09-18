import type { Metadata } from "next";
import "./globals.css";
import { AppNavigation } from "@/components/layout/AppNavigation";
import { ReticleCursor } from "@/components/ui/ReticleCursor";

export const metadata: Metadata = {
  title: "EcoRoute — Carbon-Aware Cloud Workload Orchestration Engine",
  description:
    "Scientific Multi-Objective Spatial Workload Scheduling Platform with Zero-Carbon Fabrication, Real-Time Grid Telemetry, and Mathematical Decision Explainability.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-[#06080d] text-slate-100 flex flex-col overflow-x-hidden font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
        <ReticleCursor />
        <AppNavigation />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>

        <footer className="border-t border-white/[0.05] bg-[#06080d]/80 backdrop-blur py-6 px-4 sm:px-8 text-xs text-slate-400">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-300 font-medium">EcoRoute Autonomous Platform</span>
              <span className="text-slate-600">&bull;</span>
              <span>Zero Fabrication Policy Guaranteed</span>
            </div>
            <div className="font-mono text-[11px] text-slate-500 flex items-center gap-3">
              <span>FastAPI Engine</span>
              <span>&bull;</span>
              <span>PostgreSQL + Redis</span>
              <span>&bull;</span>
              <span>Electricity Maps API</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

