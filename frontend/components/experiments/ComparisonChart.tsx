"use client";

import { useState } from "react";
import { ExperimentResultResponse } from "@/lib/types";

interface ComparisonChartProps {
  results: ExperimentResultResponse[];
  selectedStrategies?: string[];
}

const metricConfig = [
  { key: "total_co2eq_grams", label: "Emissions (gCO₂eq)", color: "bg-[#075442]" },
  { key: "total_energy_kwh", label: "Energy (kWh)", color: "bg-[#063B30]" },
  { key: "avg_execution_time_seconds", label: "Avg Duration (s)", color: "bg-[#C99B43]" },
  { key: "avg_latency_ms", label: "Avg Latency (ms)", color: "bg-[#5A7C6E]" },
] as const;

export function ComparisonChart({ results, selectedStrategies }: ComparisonChartProps) {
  const [metric, setMetric] = useState<(typeof metricConfig)[number]["key"]>("total_co2eq_grams");
  const visible = results.filter((result) => !selectedStrategies || selectedStrategies.includes(result.scheduler_algorithm));
  const selectedMetric = metricConfig.find((item) => item.key === metric) || metricConfig[0];
  const values = visible.map((result: any) => Number(result[metric])).filter(Number.isFinite);
  const max = Math.max(...values, 0);

  if (results.length === 0) {
    return (
      <div className="ecoroute-card p-8 text-sm text-[#63786C] font-mono text-center">
        No benchmark result is available. Run a benchmark above to generate a comparison from persisted results.
      </div>
    );
  }

  return (
    <div className="ecoroute-card p-6 sm:p-7 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#DCCFB5] pb-4">
        <div>
          <h3 className="text-base font-bold text-[#075442]">Persisted Benchmark Comparison</h3>
          <p className="text-xs text-[#63786C] mt-0.5">
            Values are read directly from the selected experiment. Zero synthetic extrapolation.
          </p>
        </div>
        <select
          value={metric}
          onChange={(event) => setMetric(event.target.value as typeof metric)}
          className="px-3 py-2 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5] text-xs text-[#183B32] font-mono focus:outline-none focus:border-[#075442]"
        >
          {metricConfig.map((item) => (
            <option key={item.key} value={item.key}>{item.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {visible.map((result: any) => {
          const value = Number(result[metric]);
          const width = max > 0 && Number.isFinite(value) ? (value / max) * 100 : 0;
          return (
            <div key={result.id} className="grid grid-cols-[160px_1fr_90px] gap-3 items-center">
              <span className="text-xs font-mono font-bold text-[#183B32] truncate">
                {result.scheduler_algorithm}
              </span>
              <div className="h-4 rounded-full bg-[#EADBCE] overflow-hidden">
                <div
                  className={`h-full ${selectedMetric.color} rounded-full transition-all duration-300`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="text-right text-xs font-mono font-bold text-[#183B32]">
                {Number.isFinite(value) ? value.toFixed(2) : "N/A"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#DCCFB5]">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr>
              <th className="px-3 py-2.5">Strategy</th>
              <th className="px-3 py-2.5 text-right">Deadline Compliance</th>
              <th className="px-3 py-2.5 text-right">Failure Rate</th>
              <th className="px-3 py-2.5 text-right">Deferral Rate</th>
              <th className="px-3 py-2.5 text-right">Retries</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EADBCE]">
            {visible.map((result) => (
              <tr key={`${result.id}-summary`} className="hover:bg-[#F8EEDC]">
                <td className="px-3 py-2.5 font-bold text-[#183B32]">{result.scheduler_algorithm}</td>
                <td className="px-3 py-2.5 text-right text-[#075442] font-bold">{(Number(result.deadline_compliance_rate) * 100).toFixed(1)}%</td>
                <td className="px-3 py-2.5 text-right text-[#63786C]">{(Number(result.failure_rate) * 100).toFixed(1)}%</td>
                <td className="px-3 py-2.5 text-right text-[#8C6212] font-semibold">{(Number(result.deferral_rate) * 100).toFixed(1)}%</td>
                <td className="px-3 py-2.5 text-right text-[#63786C]">{(Number(result.retry_rate) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
