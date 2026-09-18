"use client";

import { useState } from "react";
import { AnalyticsSummary } from "@/lib/types";
import {
  Layers,
  Zap,
  Leaf,
  CheckCircle2,
  Clock,
  TrendingDown,
  Activity,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

interface AnalyticsOverviewProps {
  summary: AnalyticsSummary | null;
  loading?: boolean;
}

export function AnalyticsOverview({
  summary,
  loading = false,
}: AnalyticsOverviewProps) {
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
          <div className="h-72 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  // Workload regional distribution data
  const regionalShare = [
    { label: "US-West", pct: 18, color: "#3b82f6" },
    { label: "US-East", pct: 14, color: "#06b6d4" },
    { label: "EU-West", pct: 16, color: "#10b981" },
    { label: "India", pct: 20, color: "#22c55e" },
    { label: "East Asia", pct: 12, color: "#eab308" },
    { label: "South America", pct: 8, color: "#f97316" },
    { label: "Australia", pct: 12, color: "#a855f7" },
  ];

  // Cumulative angles for SVG donut
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

  return (
    <div className="space-y-6 font-sans">
      {/* Top 3 Primary Cards (Matches Mockup #4) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: CO2 Avoided */}
        <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] shadow-2xl relative overflow-hidden">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold">
            CO₂ Emissions Avoided
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold font-mono text-white mt-2">
            38.2 t
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#22c55e] font-bold mt-2">
            <TrendingDown className="w-4 h-4" />
            <span>&uarr; 32% vs. baseline</span>
          </div>
        </div>

        {/* Card 2: Clean Energy Used */}
        <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] shadow-2xl relative overflow-hidden">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold">
            Clean Energy Used
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold font-mono text-white mt-2">
            112 MWh
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 font-bold mt-2">
            <TrendingUp className="w-4 h-4" />
            <span>&uarr; 41% vs. baseline</span>
          </div>
        </div>

        {/* Card 3: Workloads Scheduled */}
        <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] shadow-2xl relative overflow-hidden">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold">
            Workloads Scheduled
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold font-mono text-white mt-2">
            {summary?.total_jobs ? summary.total_jobs.toLocaleString() : "1,428"}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#22c55e] font-bold mt-2">
            <TrendingUp className="w-4 h-4" />
            <span>&uarr; 27% this month</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Scientific Visual Charts (Matches Mockup #4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Chart: Carbon Intensity Trend (7 cols) */}
        <div className="lg:col-span-7 glass-panel p-6 sm:p-7 rounded-2xl border border-white/[0.08] shadow-2xl space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">Carbon Intensity Trend</h3>
            <span className="text-xs font-mono text-slate-400">
              Global average [gCO₂/kWh]
            </span>
          </div>

          {/* Animated Area Curve */}
          <div className="h-56 w-full relative pt-2">
            <svg className="w-full h-full" viewBox="0 0 500 150" preserveAspectRatio="none">
              <defs>
                <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Gridlines */}
              <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
              <line x1="0" y1="75" x2="500" y2="75" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
              <line x1="0" y1="120" x2="500" y2="120" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

              {/* Shaded Area */}
              <path
                d="M 0,110 Q 70,120 130,95 T 260,115 T 390,75 T 500,90 L 500,150 L 0,150 Z"
                fill="url(#analyticsGrad)"
              />

              {/* Line */}
              <path
                d="M 0,110 Q 70,120 130,95 T 260,115 T 390,75 T 500,90"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2.5"
              />

              <circle cx="500" cy="90" r="4" fill="#22c55e" className="animate-ping" />
              <circle cx="500" cy="90" r="3" fill="#22c55e" />
            </svg>

            {/* Date Markers */}
            <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-2 pt-2 border-t border-slate-800/80">
              <span>Sep 1</span>
              <span>Sep 8</span>
              <span>Sep 15</span>
              <span>Sep 22</span>
              <span>Sep 30</span>
            </div>
          </div>
        </div>

        {/* Right Chart: Workload Distribution Donut (5 cols) */}
        <div className="lg:col-span-5 glass-panel p-6 sm:p-7 rounded-2xl border border-white/[0.08] shadow-2xl space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Workload Distribution</h3>
            <span className="text-xs font-mono text-slate-400">By Region</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
            {/* SVG Donut */}
            <div className="relative w-40 h-40 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {donutSlices.map((slice, idx) => {
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
                <span className="text-xs font-mono text-slate-400">Total</span>
                <span className="text-base font-bold font-mono text-white">100%</span>
              </div>
            </div>

            {/* Legend List */}
            <div className="space-y-1.5 text-xs font-mono w-full">
              {regionalShare.map((item) => (
                <div
                  key={item.label}
                  onMouseEnter={() => setHoveredSlice(item.label)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  className={`flex items-center justify-between px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                    hoveredSlice === item.label ? "bg-slate-900 text-white" : "text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                  </div>
                  <span className="font-bold text-slate-200">{item.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
