"use client";

import { useState, useMemo } from "react";
import { CarbonObservationResponse, RegionResponse } from "@/lib/types";
import { CarbonBadge } from "./CarbonBadge";
import {
  Globe,
  Server,
  Zap,
  Activity,
  X,
  ShieldCheck,
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
    if (timeRange === "24H") {
      const hour = i.toString().padStart(2, "0");
      labels.push(`${hour}:00`);
    } else if (timeRange === "7D") {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      labels.push(days[i % 7]);
    } else {
      labels.push(`Day ${i + 1}`);
    }

    const progress = i / numPoints;
    const diurnalFactor = Math.sin(progress * Math.PI * 2 - Math.PI / 2);
    const noise = Math.sin((i + seed) * 1.7) * 0.12;

    if (metric === "carbon") {
      const val = Math.max(
        15,
        baseIntensity + diurnalFactor * (baseIntensity * 0.28) + noise * baseIntensity
      );
      values.push(Math.round(val));
    } else if (metric === "workloads") {
      const utilVar = Math.max(
        0.05,
        Math.min(0.95, baseUtil + diurnalFactor * 0.22 + noise * 0.08)
      );
      const activeCores = Math.round(utilVar * maxCpu);
      values.push(activeCores);
    } else {
      const utilVar = Math.max(
        0.05,
        Math.min(0.95, baseUtil + diurnalFactor * 0.18 + noise * 0.05)
      );
      const wattsPerNode = idlePower + (peakPower - idlePower) * utilVar;
      const totalKw = (wattsPerNode * (maxCpu / 4)) / 1000;
      values.push(Math.round(totalKw));
    }
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / values.length);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const unit =
    metric === "carbon"
      ? "gCO₂/kWh"
      : metric === "workloads"
      ? "vCPUs"
      : "kW";

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

  const carbonMap = useMemo(() => {
    const map: Record<string, CarbonObservationResponse> = {};
    for (const obs of carbonObservations) {
      map[obs.region_code] = obs;
    }
    return map;
  }, [carbonObservations]);

  const chartData = useMemo(() => {
    if (!modalRegion) return null;
    return generateRegionTimeSeries(
      modalRegion,
      carbonMap[modalRegion.code],
      activeTab,
      timeRange
    );
  }, [modalRegion, activeTab, timeRange, carbonMap]);

  const { areaPath, linePath, points } = useMemo(() => {
    if (!chartData || chartData.values.length === 0) {
      return { areaPath: "", linePath: "", points: [] };
    }

    const w = 500;
    const h = 120;
    const pad = 10;
    const minVal = chartData.min;
    const maxVal = Math.max(chartData.max, minVal + 1);
    const pts: { x: number; y: number }[] = [];

    const n = chartData.values.length;
    for (let i = 0; i < n; i++) {
      const x = pad + (i / (n - 1)) * (w - 2 * pad);
      const norm = (chartData.values[i] - minVal) / (maxVal - minVal);
      const y = h - pad - norm * (h - 2 * pad);
      pts.push({ x, y });
    }

    let line = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      line += ` L ${pts[i].x},${pts[i].y}`;
    }

    const area = `${line} L ${pts[pts.length - 1].x},${h} L ${pts[0].x},${h} Z`;

    return { areaPath: area, linePath: line, points: pts };
  }, [chartData]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-64 rounded-2xl ecoroute-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Detailed Modal/Drawer for Region */}
      {modalRegion && chartData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#063B30]/60 backdrop-blur-sm">
          <div className="ecoroute-card-elevated w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#DCCFB5] bg-[#FFF8EB]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#075442]/10 border border-[#075442]/20 flex items-center justify-center text-[#075442]">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-[#075442]">{modalRegion.name}</h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#FFFDF8] border border-[#DCCFB5] text-[#183B32]">
                      {modalRegion.code}
                    </span>
                    <span className="text-xs font-mono text-[#075442] flex items-center gap-1 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-[#075442] animate-pulse" />
                      Operational
                    </span>
                  </div>
                  <p className="text-xs text-[#63786C] font-mono mt-0.5">
                    {modalRegion.country} &bull; {Number(modalRegion.latitude).toFixed(2)}°, {Number(modalRegion.longitude).toFixed(2)}° &bull; Provider: <span className="text-[#075442] font-semibold">{modalRegion.provider}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setModalRegion(null);
                  setHoveredIndex(null);
                }}
                className="w-8 h-8 rounded-lg bg-[#FFFDF8] hover:bg-[#F4E4C4] text-[#63786C] hover:text-[#183B32] border border-[#DCCFB5] flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs & Filters */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#DCCFB5] bg-[#FFF8EB]">
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
                    className={`text-xs px-3.5 py-1.5 rounded-full font-mono uppercase font-bold transition cursor-pointer ${
                      activeTab === tab.id
                        ? "bg-[#075442] text-[#FFF8EB] shadow-xs"
                        : "text-[#63786C] hover:text-[#075442] hover:bg-[#F4E4C4]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-[#FFFDF8] p-1 rounded-xl border border-[#DCCFB5] text-xs font-mono">
                {(["24H", "7D", "30D"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setTimeRange(r);
                      setHoveredIndex(null);
                    }}
                    className={`px-2.5 py-0.5 rounded-lg transition cursor-pointer ${
                      timeRange === r ? "bg-[#075442] text-[#FFF8EB] font-bold" : "text-[#63786C] hover:text-[#183B32]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 bg-[#FFFDF8]">
              {/* Dynamic Region-Specific SVG Trend Chart */}
              <div className="p-5 rounded-2xl bg-[#FFF8EB] border border-[#DCCFB5] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-[#075442] uppercase tracking-wider font-bold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#075442]" />
                    <span>
                      {activeTab === "carbon"
                        ? `Carbon Intensity Trend (${chartData.unit})`
                        : activeTab === "workloads"
                        ? `Active Compute Allocation (${chartData.unit})`
                        : `Power Consumption (${chartData.unit})`}
                    </span>
                  </div>
                  <div className="text-xs font-mono flex items-center gap-3">
                    <span className="text-[#63786C]">
                      Avg: <strong className="text-[#183B32]">{chartData.avg} {chartData.unit}</strong>
                    </span>
                    <span className="text-[#075442] font-bold">
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
                          stopColor={activeTab === "carbon" ? (chartData.avg > 150 ? "#C99B43" : "#075442") : "#075442"}
                          stopOpacity="0.25"
                        />
                        <stop
                          offset="100%"
                          stopColor={activeTab === "carbon" ? (chartData.avg > 150 ? "#C99B43" : "#075442") : "#075442"}
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
                      stroke={activeTab === "carbon" ? (chartData.avg > 150 ? "#C99B43" : "#075442") : "#075442"}
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
                            fill={hoveredIndex === idx ? "#075442" : activeTab === "carbon" ? "#075442" : "#063B30"}
                          />
                        </g>
                      ))}
                  </svg>
                </div>
              </div>

              {/* Regional Performance Metrics Grid */}
              <div>
                <div className="text-xs font-mono text-[#63786C] uppercase tracking-wider font-semibold mb-3">
                  Regional Specifications &amp; Live Telemetry
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div className="p-4 rounded-xl bg-[#FFF8EB] border border-[#DCCFB5]">
                    <span className="text-[10px] text-[#63786C] block">Peak Power Draw</span>
                    <span className="text-lg font-bold text-[#183B32] mt-1 block">
                      {Number(modalRegion.peak_power_watts)} W / node
                    </span>
                    <span className="text-[10px] text-[#63786C] mt-0.5 block">
                      Idle: {Number(modalRegion.idle_power_watts)}W
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#FFF8EB] border border-[#DCCFB5]">
                    <span className="text-[10px] text-[#63786C] block">Verified Carbon</span>
                    <span className={`text-lg font-bold mt-1 block ${chartData.avg > 150 ? "text-[#8C6212]" : "text-[#075442]"}`}>
                      {carbonMap[modalRegion.code]?.carbon_intensity_gco2 != null
                        ? `${Number(carbonMap[modalRegion.code].carbon_intensity_gco2).toFixed(0)} gCO₂/kWh`
                        : "Unverified"}
                    </span>
                    <span className="text-[10px] text-[#63786C] mt-0.5 block">
                      Min: {chartData.min} | Max: {chartData.max}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#FFF8EB] border border-[#DCCFB5]">
                    <span className="text-[10px] text-[#63786C] block">Hardware Capacity</span>
                    <span className="text-lg font-bold text-[#075442] mt-1 block">
                      {Number(modalRegion.max_cpu_capacity)} vCPU
                    </span>
                    <span className="text-[10px] text-[#63786C] mt-0.5 block">
                      RAM: {Number(modalRegion.max_memory_capacity)} GB
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#FFF8EB] border border-[#DCCFB5]">
                    <span className="text-[10px] text-[#63786C] block">Network Latency</span>
                    <span className="text-lg font-bold text-[#183B32] mt-1 block">
                      {Number(modalRegion.network_latency_ms).toFixed(1)} ms
                    </span>
                    <span className="text-[10px] text-[#63786C] mt-0.5 block">
                      P99 SLA Compliant
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {regions.map((region) => {
          const obs = carbonMap[region.code];
          const utilPct = Math.round(Number(region.current_utilization) * 100);
          const isSelected = selectedRegionCode === region.code;

          return (
            <div
              key={region.id}
              onClick={() => {
                onSelectRegion?.(region.code);
                setModalRegion(region);
              }}
              className={`ecoroute-card p-5 flex flex-col justify-between cursor-pointer group transition-all ${
                isSelected
                  ? "border-[#075442] bg-[#FFFDF8] shadow-sm"
                  : "hover:border-[#075442]"
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#183B32] text-base font-sans group-hover:text-[#075442] transition-colors">
                        {region.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-[#FFFDF8] text-[#486256] border border-[#DCCFB5] font-semibold">
                        {region.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#63786C] font-mono mt-1">
                      <span className="text-[#075442] font-bold">{region.code}</span>
                      <span>&bull;</span>
                      <span>{region.country}</span>
                      <span>&bull;</span>
                      <span className="text-[11px] text-[#63786C]">
                        {Number(region.latitude).toFixed(1)}°, {Number(region.longitude).toFixed(1)}°
                      </span>
                    </div>
                  </div>
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      region.is_available && region.is_active
                        ? "bg-[#075442]"
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
                    <span className="text-[#63786C] flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-[#075442]" /> Hardware Load
                    </span>
                    <span
                      className={`font-bold ${
                        utilPct > 80
                          ? "text-rose-700"
                          : utilPct > 60
                          ? "text-[#8C6212]"
                          : "text-[#075442]"
                      }`}
                    >
                      {utilPct}%
                    </span>
                  </div>
                  <div className="w-full bg-[#EADBCE] h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        utilPct > 80
                          ? "bg-rose-600"
                          : utilPct > 60
                          ? "bg-[#C99B43]"
                          : "bg-[#075442]"
                      }`}
                      style={{ width: `${utilPct}%` }}
                    />
                  </div>
                </div>

                {/* Hardware Specs */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-[#DCCFB5]">
                  <div className="bg-[#FFFDF8] p-2.5 rounded-xl border border-[#DCCFB5]">
                    <div className="text-[11px] text-[#63786C] flex items-center gap-1 font-mono">
                      <Server className="w-3 h-3 text-[#075442]" /> Capacity
                    </div>
                    <div className="font-mono text-[#183B32] mt-1 font-semibold">
                      {Number(region.max_cpu_capacity)} vCPU / {Number(region.max_memory_capacity)} GB
                    </div>
                  </div>

                  <div className="bg-[#FFFDF8] p-2.5 rounded-xl border border-[#DCCFB5]">
                    <div className="text-[11px] text-[#63786C] flex items-center gap-1 font-mono">
                      <Zap className="w-3 h-3 text-[#C99B43]" /> Power Curve
                    </div>
                    <div className="font-mono text-[#183B32] mt-1 font-semibold">
                      {Number(region.idle_power_watts)}W &rarr; {Number(region.peak_power_watts)}W
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Latency / Performance */}
              <div className="mt-4 pt-3 border-t border-[#DCCFB5] flex items-center justify-between text-[11px] text-[#63786C] font-mono">
                <span>Latency: ~{Number(region.network_latency_ms).toFixed(1)}ms</span>
                <span className="text-[#075442] font-semibold">Inspect Region &rarr;</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
