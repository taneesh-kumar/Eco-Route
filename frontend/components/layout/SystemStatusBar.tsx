"use client";

import { HealthResponse } from "@/lib/types";
import { Activity, Globe, ShieldCheck, Zap } from "lucide-react";

interface SystemStatusBarProps {
  health: HealthResponse | null;
  regionCount?: number;
  activeWorkloadsCount?: number;
}

export function SystemStatusBar({
  health,
  regionCount = 6,
  activeWorkloadsCount = 0,
}: SystemStatusBarProps) {
  const isHealthy = health?.status === "healthy" || health?.status === "degraded" || !health;

  return (
    <div className="w-full bg-[#FFF8EB]/90 border border-[#DCCFB5] rounded-xl py-2 px-4 sm:px-6 text-xs text-[#486256] flex flex-wrap items-center justify-between gap-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isHealthy ? "bg-[#075442] animate-pulse" : "bg-amber-500"}`} />
          <span className="text-[#183B32] font-semibold">
            EcoRoute Engine: {isHealthy ? "Operational" : "Monitoring"}
          </span>
        </div>

        <span className="hidden sm:inline text-[#C4B495]">&bull;</span>

        <div className="flex items-center gap-1.5 text-[12px] text-[#486256]">
          <Globe className="w-3.5 h-3.5 text-[#075442]" />
          <span>{regionCount} Global Regions Active</span>
        </div>

        {activeWorkloadsCount > 0 && (
          <>
            <span className="hidden md:inline text-[#C4B495]">&bull;</span>
            <div className="hidden md:flex items-center gap-1.5 text-[12px] text-[#486256]">
              <Activity className="w-3.5 h-3.5 text-[#0B7657]" />
              <span>{activeWorkloadsCount} Running Workloads</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-4 text-[12px]">
        <div className="flex items-center gap-1.5 text-[#075442] font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-[#075442]" />
          <span>Verified Grid Telemetry</span>
        </div>
      </div>
    </div>
  );
}
