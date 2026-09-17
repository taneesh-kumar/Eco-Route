"use client";

import { ExperimentResultResponse } from "@/lib/types";
import { Award, Zap, Cloud, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface ComparisonChartProps {
  results: ExperimentResultResponse[];
}

export function ComparisonChart({ results }: ComparisonChartProps) {
  if (results.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        No benchmark results to display. Run an experiment above.
      </div>
    );
  }

  // Find conventional baseline to compare against
  const conventional = results.find(
    (r) => r.scheduler_algorithm === "CONVENTIONAL"
  );
  const convCo2 = conventional ? Number(conventional.total_co2eq_grams) : 0;

  return (
    <div className="rounded-xl bg-[#0e1424] border border-slate-800/80 p-6 space-y-6 shadow-md">
      <div>
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Award className="w-5 h-5 text-emerald-400" /> 5-Variant Benchmark Performance Matrix
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Identical synthetic workload populations executed on isolated cloned topologies.
        </p>
      </div>

      {/* Visual Cards for Algorithms */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {results.map((res) => {
          const isEco = res.scheduler_algorithm === "ECOROUTE";
          const co2 = Number(res.total_co2eq_grams);
          let savingPct = 0;
          if (convCo2 > 0 && res.scheduler_algorithm !== "CONVENTIONAL") {
            savingPct = Math.round(((convCo2 - co2) / convCo2) * 1000) / 10;
          }

          return (
            <div
              key={res.id}
              className={`p-4 rounded-xl border flex flex-col justify-between ${
                isEco
                  ? "bg-emerald-950/20 border-emerald-500/40 shadow-sm"
                  : "bg-slate-900/60 border-slate-800"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      isEco
                        ? "bg-emerald-500 text-slate-950"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {res.scheduler_algorithm}
                  </span>
                </div>

                {/* Savings vs Baseline */}
                {res.scheduler_algorithm === "ECOROUTE" ? (
                  <div className="my-2">
                    <span className="text-[11px] text-emerald-400 font-semibold block">
                      Carbon Reduction
                    </span>
                    <span className="text-xl font-bold font-mono text-emerald-400">
                      {savingPct >= 0 ? `-${savingPct}%` : `+${Math.abs(savingPct)}%`}
                    </span>
                    <span className="text-[10px] text-slate-400 block">vs Conventional</span>
                  </div>
                ) : res.scheduler_algorithm === "CONVENTIONAL" ? (
                  <div className="my-2">
                    <span className="text-[11px] text-slate-400 font-semibold block">Baseline</span>
                    <span className="text-lg font-bold font-mono text-slate-300">0.0%</span>
                    <span className="text-[10px] text-slate-400 block">Industry Standard</span>
                  </div>
                ) : (
                  <div className="my-2">
                    <span className="text-[11px] text-slate-400 font-semibold block">Delta</span>
                    <span
                      className={`text-lg font-bold font-mono ${
                        savingPct >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {savingPct >= 0 ? `-${savingPct}%` : `+${Math.abs(savingPct)}%`}
                    </span>
                    <span className="text-[10px] text-slate-400 block">vs Conventional</span>
                  </div>
                )}

                {/* Quantitative Totals */}
                <div className="space-y-1 text-xs font-mono mt-3 pt-3 border-t border-slate-800/80">
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Total CO₂:</span>
                    <span>{co2.toFixed(1)}g</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Energy:</span>
                    <span>{Number(res.total_energy_kwh).toFixed(2)} kWh</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Avg Latency:</span>
                    <span>{Number(res.avg_latency_ms).toFixed(1)}ms</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Compliance:</span>
                    <span>{(Number(res.deadline_compliance_rate) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-400 flex justify-between">
                <span>Duplicates: {res.duplicate_execution_count}</span>
                <span>Def: {(Number(res.deferral_rate) * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comprehensive Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800/80">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider border-b border-slate-800/80">
            <tr>
              <th className="px-4 py-3">Variant</th>
              <th className="px-4 py-3 text-right">Total CO₂ (g)</th>
              <th className="px-4 py-3 text-right">Energy (kWh)</th>
              <th className="px-4 py-3 text-right">Avg Latency (ms)</th>
              <th className="px-4 py-3 text-right">Deadline Compliance</th>
              <th className="px-4 py-3 text-right">Failure Rate</th>
              <th className="px-4 py-3 text-right">Duplicates</th>
              <th className="px-4 py-3 text-right">Avg Utilization</th>
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
                <td className="px-4 py-3 text-right font-mono text-emerald-400">
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
                <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">
                  {r.duplicate_execution_count}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-300">
                  {(Number(r.avg_region_utilization) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
