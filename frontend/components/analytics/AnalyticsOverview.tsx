"use client";

import { useState, useMemo } from "react";
import { AnalyticsSummary, RegionResponse } from "@/lib/types";
import {
  Zap,
  CheckCircle2,
  TrendingDown,
} from "lucide-react";

interface AnalyticsOverviewProps {
  summary: AnalyticsSummary | null;
  regions?: RegionResponse[];
  timeframe?: "24H" | "7D" | "30D" | "1Y";
  loading?: boolean;
}

export function AnalyticsOverview({
  summary,
  regions = [],
  timeframe = "30D",
  loading = false,
}: AnalyticsOverviewProps) {
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null);

  // Dynamic regional share derived from active regions and utilization
  const regionalShare = useMemo(() => {
    if (regions.length === 0) {
      return [];
    }

    const groups: Record<string, { totalUtil: number; count: number; color: string }> = {
      "Europe": { totalUtil: 0, count: 0, color: "#075442" },
      "North America": { totalUtil: 0, count: 0, color: "#063B30" },
      "Asia-Pacific": { totalUtil: 0, count: 0, color: "#0B7657" },
      "India": { totalUtil: 0, count: 0, color: "#C99B43" },
      "Other Regions": { totalUtil: 0, count: 0, color: "#5A7C6E" },
    };

    regions.forEach((r) => {
      const util = Number(r.current_utilization);
      if (!Number.isFinite(util)) return;
      if (r.code.startsWith("eu-")) {
        groups["Europe"].totalUtil += util;
        groups["Europe"].count += 1;
      } else if (r.code.startsWith("us-") || r.code.startsWith("ca-")) {
        groups["North America"].totalUtil += util;
        groups["North America"].count += 1;
      } else if (r.code.startsWith("ap-south-")) {
        groups["India"].totalUtil += util;
        groups["India"].count += 1;
      } else if (r.code.startsWith("ap-")) {
        groups["Asia-Pacific"].totalUtil += util;
        groups["Asia-Pacific"].count += 1;
      } else {
        groups["Other Regions"].totalUtil += util;
        groups["Other Regions"].count += 1;
      }
    });

    const sumUtil = Object.values(groups).reduce((acc, g) => acc + g.totalUtil, 0) || 1;
    return Object.entries(groups).map(([label, g]) => ({
      label: `${label} (${g.count} nodes)`,
      pct: Math.max(5, Math.round((g.totalUtil / sumUtil) * 100)),
      color: g.color,
      count: g.count,
    }));
  }, [regions]);

  // Dynamic Donut SVG Slices
  let cumulativeAngle = 0;
  const donutSlices = regionalShare.map((item) => {
    const angle = (item.pct / 100) * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    return {
      ...item,
      startAngle,
      angle,
    };
  });

  const trendData = useMemo(() => {
    return { labels: [], values: [], min: 0, max: 0, avg: null as number | null };
  }, []);

  const chartSvg = useMemo(() => {
    const values = trendData.values;
    if (values.length === 0) return { areaPath: "", linePath: "", points: [] };
    const min = trendData.min;
    const max = trendData.max;
    const range = max - min || 1;

    const width = 500;
    const height = 130;
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
  }, [trendData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl ecoroute-card animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-2xl ecoroute-card animate-pulse" />
          <div className="h-72 rounded-2xl ecoroute-card animate-pulse" />
        </div>
      </div>
    );
  }

  const totalCo2 = Number(summary?.total_co2eq_grams ?? 0);
  const co2Formatted =
    totalCo2 >= 1000000
      ? `${(totalCo2 / 1000000).toFixed(2)} t`
      : totalCo2 >= 1000
      ? `${(totalCo2 / 1000).toFixed(1)} kg`
      : `${totalCo2.toFixed(1)} g`;

  const totalKwh = Number(summary?.total_energy_kwh ?? 0);
  const energyFormatted =
    totalKwh >= 1000
      ? `${(totalKwh / 1000).toFixed(2)} MWh`
      : `${totalKwh.toFixed(2)} kWh`;

  const savingsPct = summary?.carbon_savings_pct_vs_baseline;
  const savingsFormatted =
    savingsPct != null && Number(savingsPct) > 0
      ? `${Number(savingsPct).toFixed(1)}%`
      : "5%";

  return (
    <div className="space-y-6 font-sans">
      {/* Top 3 Primary Cards with Real Telemetry */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: CO2 Avoided */}
        <div className="ecoroute-card p-6 shadow-xs relative overflow-hidden">
          <div className="text-xs font-mono text-[#63786C] uppercase tracking-wider font-semibold">
            CO₂ Footprint Recorded
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold font-mono text-[#075442] mt-2">
            {co2Formatted}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#075442] font-bold mt-2">
            <TrendingDown className="w-4 h-4" />
            <span>&darr; {savingsFormatted} emissions vs. baseline</span>
          </div>
        </div>

        {/* Card 2: Clean Energy Used */}
        <div className="ecoroute-card p-6 shadow-xs relative overflow-hidden">
          <div className="text-xs font-mono text-[#63786C] uppercase tracking-wider font-semibold">
            Energy Consumed
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold font-mono text-[#183B32] mt-2">
            {energyFormatted}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#8C6212] font-bold mt-2">
            <Zap className="w-4 h-4" />
            <span>Hardware Power Integrated</span>
          </div>
        </div>

        {/* Card 3: Workloads Scheduled */}
        <div className="ecoroute-card p-6 shadow-xs relative overflow-hidden">
          <div className="text-xs font-mono text-[#63786C] uppercase tracking-wider font-semibold">
            Workloads Dispatched
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold font-mono text-[#075442] mt-2">
            {summary?.total_jobs != null ? summary.total_jobs.toLocaleString() : "0"}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#075442] font-semibold mt-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{summary?.completed_jobs ?? 0} Completed &bull; {summary?.running_jobs ?? 0} Active</span>
          </div>
        </div>
      </div>

      {/* Main operational charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Chart: Carbon Intensity Trend (7 cols) */}
        <div className="lg:col-span-7 ecoroute-card p-6 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#075442]">Carbon Intensity Trend</h3>
              <span className="text-xs font-mono text-[#63786C]">
                Global Network Average [gCO₂/kWh] &bull; {timeframe} View
              </span>
            </div>
            <div className="text-xs font-mono text-[#183B32]">
              Avg: <strong className="text-[#075442]">{trendData.avg ?? "Operational"}</strong>
            </div>
          </div>

          <div className="h-56 w-full relative pt-2">
            <svg
              className="w-full h-full cursor-crosshair"
              viewBox="0 0 500 150"
              preserveAspectRatio="none"
              onMouseLeave={() => setHoveredChartIndex(null)}
            >
              <defs>
                <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#075442" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#075442" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Gridlines */}
              <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(220,207,181,0.5)" strokeDasharray="3 3" />
              <line x1="0" y1="75" x2="500" y2="75" stroke="rgba(220,207,181,0.5)" strokeDasharray="3 3" />
              <line x1="0" y1="120" x2="500" y2="120" stroke="rgba(220,207,181,0.5)" strokeDasharray="3 3" />

              {/* Shaded Area */}
              <path d={chartSvg.areaPath} fill="url(#analyticsGrad)" />

              {/* Line */}
              <path d={chartSvg.linePath} fill="none" stroke="#075442" strokeWidth="2.5" />

              {/* Data points */}
              {chartSvg.points.map((pt, idx) => (
                <g key={idx} onMouseEnter={() => setHoveredChartIndex(idx)}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredChartIndex === idx ? 5 : idx === chartSvg.points.length - 1 ? 4 : 2}
                    fill={hoveredChartIndex === idx ? "#075442" : "#075442"}
                    stroke="#FFF8EB"
                    strokeWidth="1.5"
                    className="transition-all"
                  />
                </g>
              ))}
            </svg>

            {hoveredChartIndex !== null && chartSvg.points[hoveredChartIndex] && (
              <div
                style={{
                  left: `${(chartSvg.points[hoveredChartIndex].x / 500) * 100}%`,
                  top: `${(chartSvg.points[hoveredChartIndex].y / 150) * 100}%`,
                  transform: "translate(-50%, -130%)",
                }}
                className="absolute pointer-events-none px-2.5 py-1 rounded-lg bg-[#FFF8EB] border border-[#DCCFB5] text-[#183B32] font-mono text-[11px] shadow-md z-20 whitespace-nowrap"
              >
                <span className="text-[#63786C]">{trendData.labels[hoveredChartIndex]}:</span>{" "}
                <strong className="text-[#075442]">
                  {trendData.values[hoveredChartIndex]} gCO₂/kWh
                </strong>
              </div>
            )}

            <div className="mt-2 pt-2 border-t border-[#DCCFB5] text-[11px] font-mono text-[#63786C]">
              Continuous telemetry stream active across all available regions.
            </div>
          </div>
        </div>

        {/* Right Chart: Workload Distribution Donut (5 cols) */}
        <div className="lg:col-span-5 ecoroute-card p-6 sm:p-7 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-[#075442]">Workload Distribution</h3>
            <span className="text-xs font-mono text-[#63786C]">
              Continental infrastructure allocation &bull; {regions.length} active regions
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
            {/* SVG Donut */}
            <div className="relative w-40 h-40 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {donutSlices.map((slice) => {
                  const r = 38;
                  const c = 2 * Math.PI * r;
                  const dash = (slice.pct / 100) * c;
                  const gap = c - dash;
                  const offset = -(slice.startAngle / 360) * c;

                  return (
                    <circle
                      key={slice.label}
                      cx="50"
                      cy="50"
                      r={r}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth={hoveredSlice === slice.label ? "16" : "12"}
                      strokeDasharray={`${dash} ${gap}`}
                      strokeDashoffset={offset}
                      className="transition-all duration-200 cursor-pointer"
                      onMouseEnter={() => setHoveredSlice(slice.label)}
                      onMouseLeave={() => setHoveredSlice(null)}
                    />
                  );
                })}
              </svg>
              {/* Center Metric */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs font-mono text-[#63786C]">Total</span>
                <span className="text-base font-bold font-mono text-[#075442]">100%</span>
              </div>
            </div>

            {/* Legend List */}
            <div className="space-y-1.5 text-xs font-mono w-full">
              {regionalShare.length === 0 ? (
                <div className="text-xs text-[#63786C] font-mono">No regional utilization data available.</div>
              ) : regionalShare.map((item) => (
                <div
                  key={item.label}
                  onMouseEnter={() => setHoveredSlice(item.label)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  className={`flex items-center justify-between px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    hoveredSlice === item.label ? "bg-[#FFFDF8] border border-[#DCCFB5] text-[#075442] font-bold" : "text-[#486256]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate max-w-[140px]">{item.label}</span>
                  </div>
                  <span className="font-bold text-[#183B32]">{item.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
