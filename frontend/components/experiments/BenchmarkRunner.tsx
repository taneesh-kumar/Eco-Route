"use client";

import { useState } from "react";
import { ExperimentCreatePayload } from "@/lib/types";
import { FlaskConical, Play, CheckCircle2, Sliders, ShieldCheck, Check } from "lucide-react";

interface BenchmarkRunnerProps {
  onRunBenchmark: (payload: ExperimentCreatePayload) => Promise<void>;
  loading?: boolean;
  selectedStrategies: string[];
  onToggleStrategy: (strategy: string) => void;
  scenario: string;
  onSelectScenario: (scenario: string) => void;
}

export function BenchmarkRunner({
  onRunBenchmark,
  loading = false,
  selectedStrategies,
  onToggleStrategy,
  scenario,
  onSelectScenario,
}: BenchmarkRunnerProps) {
  const [name, setName] = useState("Academic Carbon Comparison Run");
  const [workloadCount, setWorkloadCount] = useState(30);
  const [seed, setSeed] = useState(42);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRunBenchmark({
      name: `${scenario} - Seed ${seed}`,
      workload_count: workloadCount,
      random_seed: seed,
      scenario_type: scenario,
    });
  };

  const strategiesList = [
    { key: "ECOROUTE", label: "EcoRoute (ours)", color: "#22c55e", bg: "bg-[#22c55e]" },
    { key: "CONVENTIONAL", label: "Conventional", color: "#ef4444", bg: "bg-red-500" },
    { key: "CARBON_ONLY", label: "Carbon Only", color: "#06b6d4", bg: "bg-cyan-500" },
    { key: "PERFORMANCE_ONLY", label: "Performance Only", color: "#f59e0b", bg: "bg-amber-500" },
    { key: "RANDOM", label: "Random", color: "#a855f7", bg: "bg-purple-500" },
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="glass-panel p-6 rounded-2xl border border-white/[0.08] shadow-2xl space-y-5 font-sans"
    >
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div className="text-xs font-mono uppercase text-slate-400 font-bold tracking-wider flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-[#22c55e]" />
          Simulation Control
        </div>
      </div>

      {/* Select Scenario Dropdown */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
          Select Scenario
        </label>
        <select
          value={scenario}
          onChange={(e) => onSelectScenario(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-[#22c55e] transition-colors"
        >
          <option value="Mixed Workload (Default)">Mixed Workload (Default)</option>
          <option value="Heavy Batch ETL Surge">Heavy Batch ETL Surge</option>
          <option value="Low-Latency Realtime Inference">Low-Latency Realtime Inference</option>
          <option value="Global Peak Solar Alignment">Global Peak Solar Alignment</option>
        </select>
      </div>

      {/* Select Strategies Checkboxes */}
      <div className="space-y-2.5">
        <label className="block text-xs font-semibold text-slate-300 font-mono">
          Select Strategies
        </label>
        <div className="space-y-2">
          {strategiesList.map((s) => {
            const isChecked = selectedStrategies.includes(s.key);
            return (
              <div
                key={s.key}
                onClick={() => onToggleStrategy(s.key)}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-mono cursor-pointer transition-all ${
                  isChecked
                    ? "bg-slate-900 border-slate-700 text-white"
                    : "bg-slate-950/50 border-slate-900 text-slate-500 opacity-60"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                      isChecked
                        ? "bg-[#22c55e] border-[#22c55e] text-slate-950"
                        : "border-slate-700 bg-slate-950"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${s.bg}`} />
                    <span className="font-semibold">{s.label}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Advanced Parameters: Workload Count & Seed */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
        <div>
          <label className="block text-[11px] font-mono text-slate-400 mb-1">
            Workloads: <span className="text-[#22c55e] font-bold">{workloadCount}</span>
          </label>
          <input
            type="number"
            min="5"
            max="100"
            value={workloadCount}
            onChange={(e) => setWorkloadCount(parseInt(e.target.value) || 10)}
            className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-[#22c55e]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono text-slate-400 mb-1">
            PRNG Seed
          </label>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
            className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-[#22c55e]"
          />
        </div>
      </div>

      {/* Run Benchmark Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-[#22c55e] hover:bg-[#16a34a] disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-bold text-xs font-sans rounded-xl transition-all shadow-lg shadow-emerald-950/50 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
            Running Simulation...
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-current" /> Run Simulation
          </>
        )}
      </button>
    </form>
  );
}
