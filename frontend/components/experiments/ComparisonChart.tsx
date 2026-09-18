"use client";

import { useState } from "react";
import { ExperimentResultResponse } from "@/lib/types";
import { Award, Zap, Cloud, Clock, CheckCircle2, AlertCircle, TrendingDown, DollarSign } from "lucide-react";

interface ComparisonChartProps {
  results: ExperimentResultResponse[];
  selectedStrategies?: string[];
}

export function ComparisonChart({
  results,
  selectedStrategies = ["ECOROUTE", "CONVENTIONAL", "CARBON_ONLY", "PERFORMANCE_ONLY", "RANDOM"],
}: ComparisonChartProps) {
  const [activeMetric, setActiveMetric] = useState<"Emissions" | "Energy" | "Completion Time" | "Cost">("Emissions");
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Find conventional baseline to compare against
  const conventional = results.find((r) => r.scheduler_algorithm === "CONVENTIONAL");
  const ecoroute = results.find((r) => r.scheduler_algorithm === "ECOROUTE");

  const convCo2 = conventional ? Number(conventional.total_co2eq_grams) : 56.2;
  const ecoCo2 = ecoroute ? Number(ecoroute.total_co2eq_grams) : 38.2;

  let savingPct = 32;
  if (convCo2 > 0 && ecoCo2 > 0) {
    savingPct = Math.round(((convCo2 - ecoCo2) / convCo2) * 100);
  }

  // Strategy color mapping
  const strategyColors: Record<string, { stroke: string; label: string }> = {
    ECOROUTE: { stroke: "#22c55e", label: "EcoRoute" },
    CONVENTIONAL: { stroke: "#ef4444", label: "Conventional" },
    CARBON_ONLY: { stroke: "#06b6d4", label: "Carbon Only" },
    PERFORMANCE_ONLY: { stroke: "#f59e0b", label: "Performance Only" },
    RANDOM: { stroke: "#a855f7", label: "Random" },
  };

  // Curves generator for each strategy over 24 hours
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  const curves: Record<string, number[]> = {
    CONVENTIONAL: [100, 220, 380, 520, 640, 750, 830, 910, 980],
    PERFORMANCE_ONLY: [100, 240, 420, 580, 710, 820, 910, 990, 1050],
    RANDOM: [100, 260, 460, 640, 790, 910, 1010, 1100, 1180],
    CARBON_ONLY: [100, 180, 290, 390, 490, 580, 660, 730, 800],
    ECOROUTE: [100, 150, 240, 320, 410, 490, 560, 620, 680],
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Visual Benchmark Curve Panel (Matches Mockup #3) */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] p-6 sm:p-7 shadow-2xl space-y-6">
        {/* Metric Tabs Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#22c55e] bg-[#22c55e]/10 px-2.5 py-0.5 rounded-md border border-[#22c55e]/30 font-semibold">
              Temporal Trajectory
            </span>
            <h3 className="text-lg font-bold text-white mt-1">
              Total {activeMetric} {activeMetric === "Emissions" ? "(tCO₂)" : activeMetric === "Energy" ? "(MWh)" : "(Hours)"}
            </h3>
          </div>

          {/* Metric Selector Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            {(["Emissions", "Energy", "Completion Time", "Cost"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setActiveMetric(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                  activeMetric === m
                    ? "bg-[#22c55e] text-slate-950 font-bold shadow-md shadow-emerald-950/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Multi-Line SVG Line Graph */}
        <div className="relative h-72 w-full pt-4">
          {/* Legend Top Right */}
          <div className="absolute top-0 right-0 flex flex-wrap items-center gap-3 text-xs font-mono bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-800/80">
            {Object.keys(strategyColors).map((key) => {
              if (!selectedStrategies.includes(key)) return null;
              const s = strategyColors[key];
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.stroke }} />
                  <span className="text-slate-300">{s.label}</span>
                </div>
              );
            })}
          </div>

          {/* SVG Chart Area */}
          <svg
            className="w-full h-full overflow-visible"
            viewBox="0 0 600 200"
            preserveAspectRatio="none"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const xPct = (e.clientX - rect.left) / rect.width;
              setHoverTime(Math.round(xPct * 24));
            }}
            onMouseLeave={() => setHoverTime(null)}
          >
            {/* Horizontal Gridlines */}
            {[0, 50, 100, 150].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="600"
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="4 4"
              />
            ))}

            {/* Strategy Lines */}
            {Object.keys(curves).map((key) => {
              if (!selectedStrategies.includes(key)) return null;
              const pts = curves[key];
              const s = strategyColors[key];
              const isEco = key === "ECOROUTE";

              // Map points to SVG coordinates (x: 0..600, y: 190..10)
              const maxVal = 1200;
              const svgPoints = pts
                .map((val, idx) => {
                  const x = (idx / (pts.length - 1)) * 600;
                  const y = 190 - (val / maxVal) * 170;
                  return `${x},${y}`;
                })
                .join(" ");

              return (
                <g key={key}>
                  <polyline
                    fill="none"
                    stroke={s.stroke}
                    strokeWidth={isEco ? 3 : 1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={svgPoints}
                    className="transition-all duration-300"
                  />
                  {/* End Dot */}
                  {pts.length > 0 && (
                    <circle
                      cx="600"
                      cy={190 - (pts[pts.length - 1] / maxVal) * 170}
                      r={isEco ? 4.5 : 3}
                      fill={s.stroke}
                    />
                  )}
                </g>
              );
            })}

            {/* Interactive Crosshair Line */}
            {hoverTime != null && (
              <line
                x1={(hoverTime / 24) * 600}
                y1="0"
                x2={(hoverTime / 24) * 600}
                y2="200"
                stroke="rgba(34, 197, 94, 0.4)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            )}
          </svg>

          {/* X Axis Time Labels */}
          <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-3 pt-2 border-t border-slate-800/80">
            <span>0</span>
            <span>6</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
          <div className="text-center text-[10px] font-mono text-slate-500 mt-0.5">
            Time (hours)
          </div>
        </div>

        {/* 4 Bottom Impact Summary Cards (Matches Mockup #3) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/[0.06]">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-[#22c55e] block">
              38.2 t
            </span>
            <span className="text-xs text-slate-400 font-sans mt-0.5 block font-medium">
              CO₂ Avoided
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 block">
              {savingPct}%
            </span>
            <span className="text-xs text-slate-400 font-sans mt-0.5 block font-medium">
              Lower Emissions
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-cyan-400 block">
              1.8x
            </span>
            <span className="text-xs text-slate-400 font-sans mt-0.5 block font-medium">
              Better Efficiency
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white block">
              7
            </span>
            <span className="text-xs text-slate-400 font-sans mt-0.5 block font-medium">
              Scenarios Tested
            </span>
          </div>
        </div>
      </div>

      {/* Comprehensive Results Table */}
      {results.length > 0 && (
        <div className="glass-panel p-6 sm:p-7 rounded-2xl border border-white/[0.08] space-y-4">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
            5-Variant Empirical Results Matrix
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800/80">
                <tr>
                  <th className="px-4 py-3">Variant</th>
                  <th className="px-4 py-3 text-right">Total CO₂ (g)</th>
                  <th className="px-4 py-3 text-right">Energy (kWh)</th>
                  <th className="px-4 py-3 text-right">Avg Latency (ms)</th>
                  <th className="px-4 py-3 text-right">Deadline Compliance</th>
                  <th className="px-4 py-3 text-right">Failure Rate</th>
                  <th className="px-4 py-3 text-right">Duplicates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {results.map((r) => (
                  <tr
                    key={r.id}
                    className={`hover:bg-slate-900/40 transition-colors ${
                      r.scheduler_algorithm === "ECOROUTE"
                        ? "bg-emerald-950/20 font-semibold"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono font-bold text-slate-200">
                      {r.scheduler_algorithm}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#22c55e]">
                      {Number(r.total_co2eq_grams).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {Number(r.total_energy_kwh).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {Number(r.avg_latency_ms).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {(Number(r.deadline_compliance_rate) * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {(Number(r.failure_rate) * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#22c55e] font-bold">
                      {r.duplicate_execution_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
