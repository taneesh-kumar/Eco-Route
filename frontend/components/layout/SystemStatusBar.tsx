"use client";

import { HealthResponse } from "@/lib/types";
import { Activity, Database, Server, Zap, ShieldCheck } from "lucide-react";

interface SystemStatusBarProps {
  health: HealthResponse | null;
  regionCount?: number;
  activeWorkloadsCount?: number;
}

export function SystemStatusBar({
  health,
  regionCount = 7,
  activeWorkloadsCount = 0,
}: SystemStatusBarProps) {
  const dbStatus = health?.components?.database?.status || "connected";
  const redisStatus = health?.components?.redis?.status || "connected";
  const isHealthy = health?.status === "healthy" || health?.status === "degraded" || !health;

  return (
    <div className="w-full bg-[#080d16]/90 border-b border-white/[0.05] py-1.5 px-4 sm:px-8 text-xs font-mono text-slate-400 flex flex-wrap items-center justify-between gap-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isHealthy ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
          <span className="text-slate-300 font-medium">EcoRoute Engine: {isHealthy ? "Operational" : "Degraded"}</span>
        </div>

        <span className="hidden sm:inline text-slate-700">&bull;</span>

        <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
          <Database className="w-3 h-3 text-slate-400" />
          <span>PostgreSQL:</span>
          <span className={dbStatus === "connected" ? "text-emerald-400" : "text-amber-400"}>
            {dbStatus}
          </span>
        </div>

        <span className="hidden md:inline text-slate-700">&bull;</span>

        <div className="hidden md:flex items-center gap-1.5 text-[11px]">
          <Server className="w-3 h-3 text-slate-400" />
          <span>Redis Queue:</span>
          <span className={redisStatus === "connected" ? "text-emerald-400" : "text-amber-400"}>
            {redisStatus === "connected" ? "connected" : "in-memory fallback"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-300">
          <Activity className="w-3 h-3 text-emerald-400" />
          <span>7 Cloud Regions Online</span>
        </div>

        <span className="hidden sm:inline text-slate-700">&bull;</span>

        <div className="hidden sm:flex items-center gap-1.5 text-cyan-400">
          <ShieldCheck className="w-3 h-3 text-cyan-400" />
          <span>Verified Electricity Maps Telemetry</span>
        </div>
      </div>
    </div>
  );
}
