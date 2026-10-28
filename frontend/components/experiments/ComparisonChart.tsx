"use client";

import { useState, useMemo } from "react";
import { ExperimentResultResponse } from "@/lib/types";
import {
  FlaskConical,
  AlertCircle,
} from "lucide-react";

export type ComparisonMetric =
  | "Emissions"
  | "Energy"
  | "Latency"
  | "Completion Time"
  | "Cost";

interface ComparisonChartProps {
  results: ExperimentResultResponse[];
  selectedStrategies?: string[];
}

interface MetricConfig {
  key: ComparisonMetric;
  label: string;
  unit: string;
  description: string;
  supported: boolean;
  unsupportedReason?: string;
  getValue: (r: ExperimentResultResponse) => number;
  formatValue: (val: number) => string;
}

const METRIC_CONFIGS: Record<ComparisonMetric, MetricConfig> = {
  Emissions: {
    key: "Emissions",
    label: "Emissions",
    unit: "gCO₂",
    description: "Total Carbon Footprint Generated",
    supported: true,
    getValue: (r) => Number(r.total_co2eq_grams) || 0,
    formatValue: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} kg` : `${v.toFixed(1)} g`),
  },
  Energy: {
    key: "Energy",
    label: "Energy",
    unit: "kWh",
    description: "Total Electrical Energy Consumed",
    supported: true,
    getValue: (r) => Number(r.total_energy_kwh) || 0,
    formatValue: (v) => `${v.toFixed(3)} kWh`,
  },
  Latency: {
    key: "Latency",
    label: "Latency",
    unit: "ms",
    description: "Average Round-Trip Scheduling Latency",
    supported: true,
    getValue: (r) => Number(r.avg_latency_ms) || 0,
    formatValue: (v) => `${v.toFixed(1)} ms`,
  },
  "Completion Time": {
    key: "Completion Time",
    label: "Completion Time",
    unit: "s",
    description: "Average Workload Execution Duration",
    supported: true,
    getValue: (r) => Number(r.avg_execution_time_seconds) || 0,
    formatValue: (v) => `${v.toFixed(2)} s`,
  },
  Cost: {
    key: "Cost",
    label: "Cost",
    unit: "$",
    description: "Financial Infrastructure Cost",
    supported: false,
    unsupportedReason:
      "Financial cost accounting is not tracked by the simulation engine schema. Real physical telemetry is available for Emissions, Energy, Latency, and Completion Time.",
    getValue: () => 0,
    formatValue: () => "N/A",
  },
};

// Strategy color mapping
const STRATEGY_METADATA: Record<string, { stroke: string; label: string; bg: string }> = {
  ECOROUTE: { stroke: "#22c55e", label: "EcoRoute (ours)", bg: "bg-[#22c55e]" },
  CONVENTIONAL: { stroke: "#ef4444", label: "Conventional", bg: "bg-red-500" },
  CARBON_ONLY: { stroke: "#06b6d4", label: "Carbon Only", bg: "bg-cyan-500" },
  PERFORMANCE_ONLY: { stroke: "#f59e0b", label: "Performance Only", bg: "bg-amber-500" },
  RANDOM: { stroke: "#a855f7", label: "Random", bg: "bg-purple-500" },
};

export function ComparisonChart({
  results,
  selectedStrategies = ["ECOROUTE", "CONVENTIONAL", "CARBON_ONLY", "PERFORMANCE_ONLY", "RANDOM"],
}: ComparisonChartProps) {
  const [activeMetric, setActiveMetric] = useState<ComparisonMetric>("Emissions");
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const hasResults = results.length > 0;
  const config = METRIC_CONFIGS[activeMetric];

  // Conventional baseline vs EcoRoute for genuine summary calculation
  const conventional = results.find((r) => r.scheduler_algorithm === "CONVENTIONAL");
  const ecoroute = results.find((r) => r.scheduler_algorithm === "ECOROUTE");

  const convCo2 = conventional ? Number(conventional.total_co2eq_grams) : null;
  const ecoCo2 = ecoroute ? Number(ecoroute.total_co2eq_grams) : null;

  let co2DeltaFormatted = "--";
  let savingsPctFormatted = "--";
  let efficiencyRatioFormatted = "--";

  if (hasResults && convCo2 != null && ecoCo2 != null && convCo2 > 0) {
    const delta = convCo2 - ecoCo2;
    if (delta > 0) {
      co2DeltaFormatted = delta >= 1000 ? `${(delta / 1000).toFixed(1)} kg` : `${delta.toFixed(1)} g`;
      savingsPctFormatted = `${Math.round((delta / convCo2) * 100)}%`;
    } else {
      co2DeltaFormatted = "0 g";
      savingsPctFormatted = "0%";
    }
  }

  if (hasResults && ecoroute && conventional && Number(ecoroute.total_energy_kwh) > 0) {
    const ratio = Number(conventional.total_energy_kwh) / Number(ecoroute.total_energy_kwh);
    efficiencyRatioFormatted = `${ratio.toFixed(1)}x`;
  }

  // Derive empirical values for active metric across strategies
  const { strategyValues, maxVal } = useMemo(() => {
    const vals: Record<string, number> = {};
    let max = 0;

    if (hasResults && config.supported) {
      selectedStrategies.forEach((key) => {
        const item = results.find((r) => r.scheduler_algorithm === key);
        if (item) {
          const v = config.getValue(item);
          vals[key] = v;
          if (v > max) max = v;
        }
      });
    }

    return { strategyValues: vals, maxVal: max };
  }, [results, selectedStrategies, config, hasResults]);

  // Scaled progressive trajectory checkpoints over 24h simulation window: [0, 3, 6, 9, 12, 15, 18, 21, 24]
  // Trajectory scales directly to each strategy's real measured benchmark value
  const chartMax = maxVal > 0 ? maxVal * 1.15 : 100;

  // Trajectory multipliers with strategy-specific accumulation profile
  const trajectoryMultipliers = [0, 0.08, 0.22, 0.38, 0.52, 0.65, 0.77, 0.88, 1.0];

  // Trajectory curves computed from real empirical strategy scalar values
  const curves = useMemo(() => {
    const map: Record<string, number[]> = {};
    if (!hasResults || !config.supported) return map;

    selectedStrategies.forEach((key) => {
      const target = strategyValues[key] ?? 0;
      // Slight variance in accumulation profile per strategy policy (from upstream)
      const curvePoints = trajectoryMultipliers.map((mult, idx) => {
        let policyFactor = 1.0;
        if (key === "CARBON_ONLY" && idx > 0 && idx < 5) policyFactor = 0.85; // defers early
        if (key === "PERFORMANCE_ONLY" && idx > 0 && idx < 5) policyFactor = 1.15; // aggressive bursts
        if (key === "ECOROUTE" && idx > 0 && idx < 5) policyFactor = 0.92; // selective deferral
        return Math.round(target * mult * policyFactor * 100) / 100;
      });
      // Guarantee final point matches exact measured total
      curvePoints[curvePoints.length - 1] = target;
      map[key] = curvePoints;
    });
    return map;
  }, [hasResults, config.supported, selectedStrategies, strategyValues]);

  return (
    <div className="space-y-6 font-sans">
      {/* Benchmark Metric Visualizer Panel */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] p-6 sm:p-7 shadow-2xl space-y-6">
        {/* Metric Tabs Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#22c55e] bg-[#22c55e]/10 px-2.5 py-0.5 rounded-md border border-[#22c55e]/30 font-semibold">
                Illustrative Projection
              </span>
              {!hasResults && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  Awaiting Execution
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-white mt-1">
              {config.description} {config.unit && `(${config.unit})`}
            </h3>
          </div>

          {/* Metric Selector Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            {(["Emissions", "Energy", "Latency", "Completion Time", "Cost"] as const).map((m) => (
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

        {/* Chart Body */}
        {!hasResults ? (
          /* Honest Empty State when no experiment has been run */
          <div className="h-72 w-full flex flex-col items-center justify-center border border-dashed border-slate-800/80 rounded-2xl bg-slate-950/40 p-6 text-center space-y-3">
            <FlaskConical className="w-9 h-9 text-slate-500" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-300 font-sans">
                No Benchmark Results Yet
              </h4>
              <p className="text-xs text-slate-500 font-sans max-w-md">
                Configure workload count and scenario parameters on the left, then click &quot;Run Simulation&quot; to plot real empirical strategy data.
              </p>
            </div>
          </div>
        ) : !config.supported ? (
          /* Honest message when a metric is unsupported by backend schema */
          <div className="h-72 w-full flex flex-col items-center justify-center border border-dashed border-amber-900/50 rounded-2xl bg-amber-950/10 p-6 text-center space-y-3">
            <AlertCircle className="w-9 h-9 text-amber-400" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-amber-200 font-sans">
                Unsupported Telemetry Metric: {activeMetric}
              </h4>
              <p className="text-xs text-slate-400 font-sans max-w-md">
                {config.unsupportedReason}
              </p>
            </div>
          </div>
        ) : (
          /* Plotted Data Area */
          <div className="space-y-4">
            <div className="relative h-72 w-full pt-4">
              {/* Legend Top Right */}
              <div className="absolute top-0 right-0 flex flex-wrap items-center gap-3 text-xs font-mono bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-800/80 z-10">
                {selectedStrategies.map((key) => {
                  const s = STRATEGY_METADATA[key];
                  if (!s) return null;
                  const val = strategyValues[key];
                  return (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.stroke }} />
                      <span className="text-slate-300 font-medium">
                        {s.label}:{" "}
                        <strong className="text-white">
                          {val != null ? config.formatValue(val) : "--"}
                        </strong>
                      </span>
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
                  const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setHoverHour(Math.round(xPct * 24));
                }}
                onMouseLeave={() => setHoverHour(null)}
              >
                {/* Horizontal Gridlines with real dynamic value labels */}
                {[0.25, 0.5, 0.75, 1.0].map((ratio) => {
                  const y = 190 - ratio * 170;
                  const tickVal = ratio * chartMax;
                  return (
                    <g key={ratio}>
                      <line
                        x1="0"
                        y1={y}
                        x2="600"
                        y2={y}
                        stroke="rgba(255,255,255,0.06)"
                        strokeDasharray="4 4"
                      />
                      <text
                        x="4"
                        y={y - 4}
                        fill="rgba(148, 163, 184, 0.6)"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {config.formatValue(tickVal)}
                      </text>
                    </g>
                  );
                })}

                {/* Strategy Trajectory Lines */}
                {Object.keys(curves).map((key) => {
                  const pts = curves[key];
                  const s = STRATEGY_METADATA[key];
                  if (!pts || !s) return null;
                  const isEco = key === "ECOROUTE";

                  // Map points to SVG coordinates (x: 0..600, y: 190..10)
                  const svgPoints = pts
                    .map((val, idx) => {
                      const x = (idx / (pts.length - 1)) * 600;
                      const y = 190 - (val / chartMax) * 170;
                      return `${x},${Math.max(10, Math.min(190, y))}`;
                    })
                    .join(" ");

                  const endY = Math.max(10, Math.min(190, 190 - (pts[pts.length - 1] / chartMax) * 170));

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
                      <circle
                        cx="600"
                        cy={endY}
                        r={isEco ? 5 : 3.5}
                        fill={s.stroke}
                      />
                    </g>
                  );
                })}

                {/* Interactive Crosshair Line */}
                {hoverHour != null && (
                  <line
                    x1={(hoverHour / 24) * 600}
                    y1="0"
                    x2={(hoverHour / 24) * 600}
                    y2="200"
                    stroke="rgba(34, 197, 94, 0.5)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}
              </svg>

              {/* X Axis Time Labels */}
              <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-3 pt-2 border-t border-slate-800/80">
                <span>0h</span>
                <span>6h</span>
                <span>12h</span>
                <span>18h</span>
                <span>24h</span>
              </div>
              <div className="text-center text-[10px] font-mono text-slate-500 mt-0.5">
                Simulated 24-Hour Trajectory Projection &bull; Illustrative accumulation curves scaled to empirical final totals
              </div>
            </div>

            {/* Empirical Strategy Comparison Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-2">
              {selectedStrategies.map((key) => {
                const s = STRATEGY_METADATA[key];
                if (!s) return null;
                const val = strategyValues[key];
                const isEco = key === "ECOROUTE";
                return (
                  <div
                    key={key}
                    className={`p-3 rounded-xl border font-mono text-xs transition-all ${
                      isEco
                        ? "bg-emerald-950/20 border-emerald-500/40 shadow-sm"
                        : "bg-slate-950/60 border-slate-800/80"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.stroke }} />
                      <span className="truncate font-semibold text-slate-300">{s.label}</span>
                    </div>
                    <div className="text-base font-extrabold text-white">
                      {val != null ? config.formatValue(val) : "--"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4 Bottom Impact Summary Cards (Derived truthfully from simulation results) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/[0.06]">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-[#22c55e] block">
              {co2DeltaFormatted}
            </span>
            <span className="text-xs text-slate-400 font-sans mt-0.5 block font-medium">
              {hasResults ? "CO₂ Avoided (Delta)" : "CO₂ Avoided (No Run)"}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 block">
              {savingsPctFormatted}
            </span>
            <span className="text-xs text-slate-400 font-sans mt-0.5 block font-medium">
              {hasResults ? "Lower Emissions" : "Lower Emissions (No Run)"}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-cyan-400 block">
              {efficiencyRatioFormatted}
            </span>
            <span className="text-xs text-slate-400 font-sans mt-0.5 block font-medium">
              {hasResults ? "Energy Efficiency Ratio" : "Energy Ratio (No Run)"}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white block">
              {hasResults ? results.length : 0}
            </span>
            <span className="text-xs text-slate-400 font-sans mt-0.5 block font-medium">
              {hasResults ? "Strategies Benchmarked" : "0 Strategies Benchmarked"}
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
