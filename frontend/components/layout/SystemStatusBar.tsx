"use client";

import { HealthResponse } from "@/lib/types";
import { Activity, Database, Server, ShieldCheck } from "lucide-react";

interface SystemStatusBarProps {
  health: HealthResponse | null;
  loading?: boolean;
  regionCount?: number;
  activeWorkloadsCount?: number;
}

export function SystemStatusBar({
  health,
  loading = false,
  regionCount = 0,
  activeWorkloadsCount = 0,
}: SystemStatusBarProps) {
  // Determine engine health status
  let engineLabel: string;
  let engineIndicatorClass: string;
  let engineTextClass: string;

  if (health) {
    if (health.status === "healthy") {
      engineLabel = "Operational";
      engineIndicatorClass = "bg-emerald-400 animate-pulse";
      engineTextClass = "text-emerald-400 font-semibold";
    } else if (health.status === "degraded") {
      engineLabel = "Degraded";
      engineIndicatorClass = "bg-amber-400";
      engineTextClass = "text-amber-400 font-semibold";
    } else {
      engineLabel = "Unhealthy";
      engineIndicatorClass = "bg-rose-500";
      engineTextClass = "text-rose-400 font-semibold";
    }
  } else if (loading) {
    engineLabel = "Connecting...";
    engineIndicatorClass = "bg-cyan-400 animate-pulse";
    engineTextClass = "text-slate-300 font-medium";
  } else {
    engineLabel = "Unreachable";
    engineIndicatorClass = "bg-rose-500";
    engineTextClass = "text-rose-400 font-semibold";
  }

  // Database component health - only claimed connected if health response confirms it
  const rawDbStatus = health?.components?.database?.status;
  let dbLabel: string;
  let dbClass: string;
  if (!health) {
    dbLabel = loading ? "checking..." : "unreachable";
    dbClass = loading ? "text-slate-400" : "text-rose-400";
  } else if (rawDbStatus === "connected") {
    dbLabel = "connected";
    dbClass = "text-emerald-400";
  } else if (rawDbStatus === "unconfigured") {
    dbLabel = "unconfigured";
    dbClass = "text-amber-400";
  } else if (rawDbStatus === "unavailable") {
    dbLabel = "unavailable";
    dbClass = "text-rose-400";
  } else {
    dbLabel = rawDbStatus || "unknown";
    dbClass = "text-slate-400";
  }

  // Redis component health - only claimed connected if health response confirms it
  const rawRedisStatus = health?.components?.redis?.status;
  let redisLabel: string;
  let redisClass: string;
  if (!health) {
    redisLabel = loading ? "checking..." : "unreachable";
    redisClass = loading ? "text-slate-400" : "text-rose-400";
  } else if (rawRedisStatus === "connected") {
    redisLabel = "connected";
    redisClass = "text-emerald-400";
  } else if (rawRedisStatus === "unconfigured") {
    redisLabel = "in-memory fallback";
    redisClass = "text-amber-400";
  } else if (rawRedisStatus === "unavailable") {
    redisLabel = "unavailable";
    redisClass = "text-rose-400";
  } else {
    redisLabel = rawRedisStatus || "unknown";
    redisClass = "text-slate-400";
  }

  // Region status text using actual dynamic regionCount prop
  let regionText: string;
  if (regionCount > 0) {
    regionText = `${regionCount} Cloud Region${regionCount === 1 ? "" : "s"} Online`;
  } else if (loading) {
    regionText = "Scanning Regions...";
  } else {
    regionText = "0 Cloud Regions Online";
  }

  const isTelemetryAvailable = health !== null || loading;

  return (
    <div className="w-full bg-[#080d16]/90 border-b border-white/[0.05] py-1.5 px-4 sm:px-8 text-xs font-mono text-slate-400 flex flex-wrap items-center justify-between gap-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${engineIndicatorClass}`} />
          <span className="text-slate-300 font-medium">EcoRoute Engine: </span>
          <span className={engineTextClass}>{engineLabel}</span>
        </div>

        <span className="hidden sm:inline text-slate-700">&bull;</span>

        <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
          <Database className="w-3 h-3 text-slate-400" />
          <span>PostgreSQL:</span>
          <span className={dbClass}>{dbLabel}</span>
        </div>

        <span className="hidden md:inline text-slate-700">&bull;</span>

        <div className="hidden md:flex items-center gap-1.5 text-[11px]">
          <Server className="w-3 h-3 text-slate-400" />
          <span>Redis Queue:</span>
          <span className={redisClass}>{redisLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-300">
          <Activity className="w-3 h-3 text-emerald-400" />
          <span>{regionText}</span>
        </div>

        <span className="hidden sm:inline text-slate-700">&bull;</span>

        <div
          className={`hidden sm:flex items-center gap-1.5 ${
            isTelemetryAvailable ? "text-cyan-400" : "text-slate-500"
          }`}
        >
          <ShieldCheck className="w-3 h-3" />
          <span>
            {isTelemetryAvailable
              ? "Verified Electricity Maps Telemetry"
              : "Telemetry Unavailable"}
          </span>
        </div>
      </div>
    </div>
  );
}
