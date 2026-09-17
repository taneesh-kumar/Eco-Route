"use client";

import { useEffect, useState } from "react";
import { CarbonObservationResponse, RegionResponse } from "@/lib/types";
import { CarbonBadge } from "./CarbonBadge";
import { Globe, Server, Zap, Activity } from "lucide-react";

interface RegionGridProps {
  regions: RegionResponse[];
  carbonObservations?: CarbonObservationResponse[];
  loading?: boolean;
}

export function RegionGrid({
  regions,
  carbonObservations = [],
  loading = false,
}: RegionGridProps) {
  const [carbonMap, setCarbonMap] = useState<Record<string, CarbonObservationResponse>>({});

  useEffect(() => {
    const map: Record<string, CarbonObservationResponse> = {};
    for (const obs of carbonObservations) {
      map[obs.region_code] = obs;
    }
    setCarbonMap(map);
  }, [carbonObservations]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-56 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (regions.length === 0) {
    return (
      <div className="p-12 text-center rounded-xl bg-slate-900/40 border border-slate-800">
        <Globe className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-300">No Target Regions Loaded</h3>
        <p className="text-sm text-slate-400 mt-1">
          Seed the database topology to begin carbon-aware dispatch.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {regions.map((region) => {
        const obs = carbonMap[region.code];
        const utilPct = Math.round(Number(region.current_utilization) * 100);

        return (
          <div
            key={region.id}
            className="rounded-xl bg-[#0e1424] border border-slate-800/80 p-5 hover:border-slate-700/80 transition-all flex flex-col justify-between shadow-sm group"
          >
            <div>
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100 text-base">{region.name}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-slate-800 text-slate-300 border border-slate-700">
                      {region.provider}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono mt-0.5">
                    <span>{region.code}</span>
                    <span>&bull;</span>
                    <span>{region.country}</span>
                  </div>
                </div>
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    region.is_available && region.is_active
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                      : "bg-rose-500"
                  }`}
                  title={region.is_available ? "Available" : "Offline"}
                />
              </div>

              {/* Carbon Intensity Badge */}
              <div className="mb-4">
                <CarbonBadge
                  intensity={obs?.carbon_intensity_gco2 ?? null}
                  quality={obs?.quality ?? null}
                  source={obs?.source ?? null}
                  showSource
                />
              </div>

              {/* Utilization Bar */}
              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" /> Utilization
                  </span>
                  <span
                    className={`font-mono font-medium ${
                      utilPct > 80
                        ? "text-rose-400"
                        : utilPct > 60
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {utilPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-800/80 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      utilPct > 80
                        ? "bg-rose-500"
                        : utilPct > 60
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${utilPct}%` }}
                  />
                </div>
              </div>

              {/* Hardware Capacity & Power Specs */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-800/60">
                <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/40">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Server className="w-3 h-3 text-slate-400" /> Max Capacity
                  </div>
                  <div className="font-mono text-slate-200 mt-0.5">
                    {Number(region.max_cpu_capacity)} vCPU / {Number(region.max_memory_capacity)} GB
                  </div>
                </div>

                <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/40">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" /> Power Curve
                  </div>
                  <div className="font-mono text-slate-200 mt-0.5">
                    {Number(region.idle_power_watts)}W &rarr; {Number(region.peak_power_watts)}W
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Latency / Speed */}
            <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Latency: ~{Number(region.network_latency_ms).toFixed(1)}ms</span>
              <span>Perf: {Number(region.performance_factor).toFixed(2)}x</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
