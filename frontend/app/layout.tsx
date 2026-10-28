import type { Metadata } from "next";
import "./globals.css";
import { AppNavigation } from "@/components/layout/AppNavigation";

export const metadata: Metadata = {
  title: "EcoRoute — Intelligent Carbon-Aware Cloud Workload Scheduling",
  description:
    "Intelligently schedules cloud workloads across global regions to minimize carbon emissions while meeting strict latency and SLA goals.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#F4E4C4] text-[#183B32] flex flex-col overflow-x-hidden font-sans selection:bg-[#075442]/20 selection:text-[#075442]">
        <AppNavigation />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>

        <footer className="border-t border-[#DCCFB5] bg-[#FFF8EB]/80 backdrop-blur py-6 px-4 sm:px-8 text-xs text-[#63786C]">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#075442]" />
              <span className="text-[#183B32] font-semibold">EcoRoute</span>
              <span className="text-[#A5BDAA]">&bull;</span>
              <span>Intelligent Carbon-Aware Infrastructure</span>
            </div>
            <div className="text-[12px] text-[#63786C] flex items-center gap-3">
              <span>Verified Grid Telemetry</span>
              <span className="text-[#A5BDAA]">&bull;</span>
              <span>Dynamic Spatial Routing</span>
              <span className="text-[#A5BDAA]">&bull;</span>
              <span>Multi-Objective Scheduling</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
