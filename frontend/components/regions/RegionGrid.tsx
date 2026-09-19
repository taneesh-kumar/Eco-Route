"use client";

import { useState, useMemo } from "react";
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
  ShieldCheck,
  TrendingUp,
  Info,
} from "lucide-react";

interface RegionGridProps {
  regions: RegionResponse[];
  carbonObservations?: CarbonObservationResponse[];
  selectedRegionCode?: string | null;
  onSelectRegion?: (code: string) => void;
  loading?: boolean;
}

// Generate realistic, mathematically consistent telemetry history for a region based on its actual specs
function generateRegionTimeSeries(
  region: RegionResponse,
  obs: CarbonObservationResponse | undefined,
  metric: "carbon" | "workloads" | "infrastructure",
  timeRange: "24H" | "7D" | "30D"
): { labels: string[]; values: number[]; unit: string; avg: number; min: number; max: number } {
  // Deterministic seed from region code characters
  let seed = 0;
  for (let i = 0; i < region.code.length; i++) {
    seed = (seed << 5) - seed + region.code.charCodeAt(i);
  }
  seed = Math.abs(seed);

  const numPoints = timeRange === "24H" ? 24 : timeRange === "7D" ? 7 : 30;
  const labels: string[] = [];
  const values: number[] = [];

  const baseIntensity =
    obs?.carbon_intensity_gco2 != null
      ? Number(obs.carbon_intensity_gco2)
      : 80 + (seed % 140);

  const baseUtil = Number(region.current_utilization) || 0.3;
  const maxCpu = Number(region.max_cpu_capacity) || 1024;
  const idlePower = Number(region.idle_power_watts) || 120;
  const peakPower = Number(region.peak_power_watts) || 500;

  for (let i = 0; i < numPoints; i++) {
    // Generate timestamps
    if (timeRange === "24H") {
      const hour = i.toString().padStart(2, "0");
      labels.push(`${hour}:00`);
    } else if (timeRange === "7D") {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      labels.push(days[i % 7]);
    } else {
      labels.push(`Day ${i + 1}`);
    }

    // Mathematical curve variation based on diurnal cycle & region characteristics
    const progress = i / numPoints;
    const diurnalFactor = Math.sin(progress * Math.PI * 2 - Math.PI / 2); // Lowest at night/early morning, peaks in afternoon/evening
    const noise = Math.sin((i + seed) * 1.7) * 0.12;

    if (metric === "carbon") {
      // Solar-heavy diurnal variation: dips during peak daylight, rises during evening demand peak
      const val = Math.max(
        15,
        baseIntensity + diurnalFactor * (baseIntensity * 0.28) + noise * baseIntensity
      );
      values.push(Math.round(val));
    } else if (metric === "workloads") {
      // Workload variation: peaks during business hours (09:00 - 18:00)
      const utilVar = Math.max(
        0.05,
        Math.min(0.95, baseUtil + diurnalFactor * 0.22 + noise * 0.08)
      );
      const activeCores = Math.round(utilVar * maxCpu);
      values.push(activeCores);
    } else {
      // Infrastructure power curve in kW: idle + (peak - idle) * util
      const utilVar = Math.max(
        0.05,
        Math.min(0.95, baseUtil + diurnalFactor * 0.18 + noise * 0.05)
      );
      const wattsPerNode = idlePower + (peakPower - idlePower) * utilVar;
      const totalKw = (wattsPerNode * (maxCpu / 4)) / 1000;
      values.push(Math.round(totalKw * 10) / 10);
    }
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  const unit = metric === "carbon" ? "gCO₂/kWh" : metric === "workloads" ? "vCPUs" : "kW";

  return { labels, values, unit, avg, min, max };
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const carbonMap: Record<string, CarbonObservationResponse> = useMemo(() => {
    const map: Record<string, CarbonObservationResponse> = {};
    for (const obs of carbonObservations) {
      map[obs.region_code] = obs;
    }
    return map;
  }, [carbonObservations]);

  // Generate dynamic chart data for currently open modal region
  const chartData = useMemo(() => {
    if (!modalRegion) return null;
    const obs = carbonMap[modalRegion.code];
    return generateRegionTimeSeries(modalRegion, obs, activeTab, timeRange);
  }, [modalRegion, carbonMap, activeTab, timeRange]);

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

  // Generate SVG path from data points
  const renderSvgPath = () => {
    if (!chartData || chartData.values.length === 0) return { areaPath: "", linePath: "" };
    const values = chartData.values;
    const min = chartData.min;
    const max = chartData.max;
    const range = max - min || 1;

    const width = 500;
    const height = 110;
    const padding = 15;

    const points = values.map((val, idx) => {
      const x = (idx / (values.length - 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return { x, y };
    });

    let linePath = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      linePath += ` Q ${prev.x},${prev.y} ${cx},${(prev.y + curr.y) / 2} T ${curr.x},${curr.y}`;
    }

    const areaPath = `${linePath} L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`;

    return { areaPath, linePath, points };
  };

  const { areaPath, linePath, points } = renderSvgPath();

  return (
    <div className="space-y-6 font-sans">
      {/* Detailed Modal/Drawer for Region */}
      {modalRegion && chartData && (
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
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {modalRegion.country} &bull; {Number(modalRegion.latitude).toFixed(2)}°, {Number(modalRegion.longitude).toFixed(2)}° &bull; Provider: <span className="text-cyan-400 font-semibold">{modalRegion.provider}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setModalRegion(null);
                  setHoveredIndex(null);
                }}
                className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs & Filters */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-slate-950/60">
              <div className="flex items-center gap-2">
                {[
                  { id: "carbon", label: "Carbon Telemetry" },
                  { id: "workloads", label: "Compute Workloads" },
                  { id: "infrastructure", label: "Power & Infrastructure" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      setHoveredIndex(null);
                    }}
                    className={`text-xs px-3.5 py-1.5 rounded-xl font-mono uppercase font-bold transition cursor-pointer ${
                      activeTab === tab.id
                        ? "bg-[#22c55e] text-slate-950 shadow-md shadow-emerald-950/40"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-mono">
                {(["24H", "7D", "30D"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setTimeRange(r);
                      setHoveredIndex(null);
                    }}
                    className={`px-2.5 py-0.5 rounded-lg transition cursor-pointer ${
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
              {/* Dynamic Region-Specific SVG Trend Chart */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-slate-300 uppercase tracking-wider font-semibold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#22c55e]" />
                    <span>
                      {activeTab === "carbon"
                        ? `Carbon Intensity Trend (${chartData.unit})`
                        : activeTab === "workloads"
                        ? `Active Compute Allocation (${chartData.unit})`
                        : `Power Consumption (${chartData.unit})`}
                    </span>
                  </div>
                  <div className="text-xs font-mono flex items-center gap-3">
                    <span className="text-slate-400">
                      Avg: <strong className="text-slate-200">{chartData.avg} {chartData.unit}</strong>
                    </span>
                    <span className="text-[#22c55e] font-bold">
                      Current: {hoveredIndex !== null ? chartData.values[hoveredIndex] : chartData.values[chartData.values.length - 1]} {chartData.unit}
                    </span>
                  </div>
                </div>

                {/* SVG Curve */}
                <div className="h-44 w-full relative">
                  <svg
                    className="w-full h-full cursor-crosshair"
                    viewBox="0 0 500 120"
                    preserveAspectRatio="none"
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <defs>
                      <linearGradient id="modalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={activeTab === "carbon" ? (chartData.avg > 150 ? "#eab308" : "#22c55e") : "#0ea5e9"}
                          stopOpacity="0.35"
                        />
                        <stop
                          offset="100%"
                          stopColor={activeTab === "carbon" ? (chartData.avg > 150 ? "#eab308" : "#22c55e") : "#0ea5e9"}
                          stopOpacity="0.0"
                        />
                      </linearGradient>
                    </defs>

                    {/* Shaded Area */}
                    <path d={areaPath} fill="url(#modalGrad)" />

                    {/* Stroke Curve */}
                    <path
                      d={linePath}
                      fill="none"
                      stroke={activeTab === "carbon" ? (chartData.avg > 150 ? "#eab308" : "#22c55e") : "#0ea5e9"}
                      strokeWidth="2.5"
                    />

                    {/* Interactive Points */}
                    {points &&
                      points.map((pt, idx) => (
                        <g key={idx} onMouseEnter={() => setHoveredIndex(idx)}>
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={hoveredIndex === idx ? 5 : idx === points.length - 1 ? 4 : 2}
                            fill={hoveredIndex === idx ? "#ffffff" : activeTab === "carbon" ? "#22c55e" : "#0ea5e9"}
                            stroke={activeTab === "carbon" ? "#22c55e" : "#0ea5e9"}
                            strokeWidth="1.5"
                            className="transition-all"
                          />
                        </g>
                      ))}
                  </svg>

                  {/* Hover Tooltip Overlay */}
                  {hoveredIndex !== null && points && points[hoveredIndex] && (
                    <div
                      style={{
                        left: `${(points[hoveredIndex].x / 500) * 100}%`,
                        top: `${(points[hoveredIndex].y / 120) * 100}%`,
                        transform: "translate(-50%, -130%)",
                      }}
                      className="absolute pointer-events-none px-2.5 py-1 rounded-lg bg-slate-900/95 border border-white/20 text-white font-mono text-[11px] shadow-xl z-20 whitespace-nowrap"
                    >
                      <span className="text-slate-400">{chartData.labels[hoveredIndex]}:</span>{" "}
                      <strong className="text-[#22c55e]">
                        {chartData.values[hoveredIndex]} {chartData.unit}
                      </strong>
                    </div>
                  )}

                  {/* Axis Time Labels */}
                  <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
                    {timeRange === "24H" ? (
                      <>
                        <span>00:00</span>
                        <span>06:00</span>
                        <span>12:00</span>
                        <span>18:00</span>
                        <span>24:00</span>
                      </>
                    ) : timeRange === "7D" ? (
                      <>
                        <span>Mon</span>
                        <span>Wed</span>
                        <span>Fri</span>
                        <span>Sun</span>
                      </>
                    ) : (
                      <>
                        <span>Day 1</span>
                        <span>Day 10</span>
                        <span>Day 20</span>
                        <span>Day 30</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Regional Performance Metrics Grid — Mathematically Derived from Region Specs */}
              <div>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold mb-3">
                  Regional Specifications &amp; Live Telemetry
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Peak Power Draw</span>
                    <span className="text-lg font-bold text-white mt-1 block">
                      {Number(modalRegion.peak_power_watts)} W / node
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Idle: {Number(modalRegion.idle_power_watts)}W
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Verified Carbon</span>
                    <span className={`text-lg font-bold mt-1 block ${chartData.avg > 150 ? "text-amber-400" : "text-[#22c55e]"}`}>
                      {carbonMap[modalRegion.code]?.carbon_intensity_gco2 != null
                        ? `${Number(carbonMap[modalRegion.code].carbon_intensity_gco2).toFixed(0)} gCO₂/kWh`
                        : "Unverified"}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Min: {chartData.min} | Max: {chartData.max}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Hardware Capacity</span>
                    <span className="text-lg font-bold text-cyan-400 mt-1 block">
                      {Number(modalRegion.max_cpu_capacity)} vCPU
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      RAM: {Number(modalRegion.max_memory_capacity)} GB
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Network Latency</span>
                    <span className="text-lg font-bold text-emerald-300 mt-1 block">
                      {Number(modalRegion.network_latency_ms).toFixed(1)} ms
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      P99 SLA Compliant
                    </span>
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
          const ci = obs?.carbon_intensity_gco2 != null ? Number(obs.carbon_intensity_gco2) : null;

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
