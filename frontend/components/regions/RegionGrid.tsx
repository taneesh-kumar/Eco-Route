"use client";

import { useState } from "react";
import { CarbonObservationResponse, RegionResponse } from "@/lib/types";
import { CarbonBadge } from "./CarbonBadge";
import {
  Globe,
  Server,
  Zap,
  Activity,
  Cpu,
  MapPin,
  Clock,
  Radio,
  CheckCircle2,
  TrendingDown,
  X,
  Layers,
  BarChart3,
} from "lucide-react";

interface RegionGridProps {
  regions: RegionResponse[];
  carbonObservations?: CarbonObservationResponse[];
  selectedRegionCode?: string | null;
  onSelectRegion?: (code: string) => void;
  loading?: boolean;
}

export function RegionGrid({
  regions,
  carbonObservations = [],
  selectedRegionCode,
  onSelectRegion,
  loading = false,
}: RegionGridProps) {
  const [modalRegion, setModalRegion] = useState<RegionResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"carbon" | "workloads" | "infrastructure">("carbon");
  const [timeRange, setTimeRange] = useState<"24H" | "7D" | "30D">("24H");

  const carbonMap: Record<string, CarbonObservationResponse> = {};
  for (const obs of carbonObservations) {
    carbonMap[obs.region_code] = obs;
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-60 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (regions.length === 0) {
    return (
      <div className="glass-panel p-12 text-center rounded-2xl border border-white/[0.08]">
        <Globe className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-300 font-sans">No Target Regions Loaded</h3>
        <p className="text-xs text-slate-400 mt-1 font-sans">
          Seed the database topology to begin multi-region carbon-aware dispatch.
        </p>
      </div>
    );
  }

  const selectedRegion = regions.find((r) => r.code === selectedRegionCode) || regions[0];
  const selectedObs = selectedRegion ? carbonMap[selectedRegion.code] : null;

  return (
    <div className="space-y-6 font-sans">
      {/* Detailed Modal/Drawer for Region (Matches Mockup #6) */}
      {modalRegion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="glass-panel w-full max-w-4xl max-h-[90vh] rounded-2xl border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08] bg-slate-950/90">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[#22c55e]">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">{modalRegion.name}</h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                      {modalRegion.code}
                    </span>
                    <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                      Operational
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    {(modalRegion as any).city ? `${(modalRegion as any).city}, ${modalRegion.country}` : modalRegion.country} &bull; {Number(modalRegion.latitude).toFixed(2)}°, {Number(modalRegion.longitude).toFixed(2)}°
                  </p>
                </div>
              </div>

              <button
                onClick={() => setModalRegion(null)}
                className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs & Filters */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-slate-950/60">
              <div className="flex items-center gap-2">
                {(["carbon", "workloads", "infrastructure"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`text-xs px-3.5 py-1.5 rounded-xl font-mono uppercase font-bold transition cursor-pointer ${
                      activeTab === tab
                        ? "bg-[#22c55e] text-slate-950 shadow-md shadow-emerald-950/40"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-mono">
                {(["24H", "7D", "30D"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-2.5 py-0.5 rounded-lg transition ${
                      timeRange === r ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Carbon Intensity SVG Trend */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold">
                    Carbon Intensity Trend (gCO₂/kWh)
                  </div>
                  <div className="text-xs font-mono text-[#22c55e] font-bold">
                    Current: {carbonMap[modalRegion.code]?.carbon_intensity_gco2 != null ? `${Number(carbonMap[modalRegion.code].carbon_intensity_gco2).toFixed(1)} gCO₂/kWh` : "62.0 gCO₂/kWh"}
                  </div>
                </div>

                {/* SVG Curve */}
                <div className="h-44 w-full relative">
                  <svg className="w-full h-full" viewBox="0 0 500 120" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="modalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 0,80 Q 80,40 160,70 T 320,50 T 500,60 L 500,120 L 0,120 Z"
                      fill="url(#modalGrad)"
                    />
                    <path
                      d="M 0,80 Q 80,40 160,70 T 320,50 T 500,60"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2.5"
                    />
                    <circle cx="500" cy="60" r="4" fill="#22c55e" className="animate-ping" />
                    <circle cx="500" cy="60" r="3" fill="#22c55e" />
                  </svg>
                  <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
                    <span>00:00</span>
                    <span>06:00</span>
                    <span>12:00</span>
                    <span>18:00</span>
                    <span>24:00</span>
                  </div>
                </div>
              </div>

              {/* Regional Metrics Grid */}
              <div>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold mb-3">
                  Regional Performance Metrics
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Current Usage</span>
                    <span className="text-lg font-bold text-white mt-1 block">24.6 MWh</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Estimated Emissions</span>
                    <span className="text-lg font-bold text-[#22c55e] mt-1 block">12.1 t</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Active Workloads</span>
                    <span className="text-lg font-bold text-cyan-400 mt-1 block">4 Active</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Cluster Uptime</span>
                    <span className="text-lg font-bold text-emerald-300 mt-1 block">99.9%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid Cards (Clean, layered, clickable) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {regions.map((region) => {
          const obs = carbonMap[region.code];
          const utilPct = Math.round(Number(region.current_utilization) * 100);
          const isSelected = selectedRegionCode === region.code;
          const ci = obs?.carbon_intensity_gco2 != null ? Number(obs.carbon_intensity_gco2) : 50;

          return (
            <div
              key={region.id}
              onClick={() => {
                onSelectRegion?.(region.code);
                setModalRegion(region);
              }}
              className={`glass-panel-interactive rounded-2xl p-5 flex flex-col justify-between cursor-pointer group transition-all ${
                isSelected
                  ? "border-[#22c55e] shadow-lg shadow-emerald-950/40 bg-emerald-950/10"
                  : "hover:border-slate-700"
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-base font-sans group-hover:text-emerald-300 transition-colors">
                        {region.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-slate-900 text-slate-300 border border-slate-800 font-bold">
                        {region.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono mt-1">
                      <span className="text-emerald-400 font-semibold">{region.code}</span>
                      <span>&bull;</span>
                      <span>{region.country}</span>
                      <span>&bull;</span>
                      <span className="text-[11px] text-slate-500">
                        {Number(region.latitude).toFixed(1)}°, {Number(region.longitude).toFixed(1)}°
                      </span>
                    </div>
                  </div>
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      region.is_available && region.is_active
                        ? "bg-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.8)] animate-pulse"
                        : "bg-rose-500"
                    }`}
                    title={region.is_available ? "Active & Online" : "Offline"}
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
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-emerald-400" /> Hardware Load
                    </span>
                    <span
                      className={`font-bold ${
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
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
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

                {/* Hardware Specs */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-white/[0.06]">
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <Server className="w-3 h-3 text-slate-400" /> Capacity
                    </div>
                    <div className="font-mono text-slate-200 mt-1 font-semibold">
                      {Number(region.max_cpu_capacity)} vCPU / {Number(region.max_memory_capacity)} GB
                    </div>
                  </div>

                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <Zap className="w-3 h-3 text-amber-400" /> Power Curve
                    </div>
                    <div className="font-mono text-slate-200 mt-1 font-semibold">
                      {Number(region.idle_power_watts)}W &rarr; {Number(region.peak_power_watts)}W
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Latency / Performance */}
              <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Latency: ~{Number(region.network_latency_ms).toFixed(1)}ms</span>
                <span className="text-emerald-400 font-semibold">Click to Inspect &rarr;</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
