"use client";

import { useState } from "react";
import { ExperimentCreatePayload } from "@/lib/types";
import { FlaskConical, Play, Check } from "lucide-react";

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
  const [workloadCount, setWorkloadCount] = useState(30);
  const [seed, setSeed] = useState(1);

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
    { key: "ECOROUTE", label: "EcoRoute (Multi-Objective)", color: "#075442" },
    { key: "CONVENTIONAL", label: "Conventional Baseline", color: "#BE123C" },
    { key: "CARBON_ONLY", label: "Carbon-Only Greedy", color: "#0B7657" },
    { key: "PERFORMANCE_ONLY", label: "Performance-Only Greedy", color: "#C99B43" },
    { key: "RANDOM", label: "Random Dispatch", color: "#63786C" },
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="ecoroute-card p-6 shadow-xs space-y-5 font-sans"
    >
      <div className="flex items-center justify-between pb-3 border-b border-[#DCCFB5]">
        <div className="text-xs font-mono uppercase text-[#075442] font-bold tracking-wider flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-[#075442]" />
          Simulation Control
        </div>
      </div>

      {/* Select Scenario Dropdown */}
      <div>
        <label className="block text-xs font-semibold text-[#183B32] mb-1.5 font-mono">
          Select Scenario
        </label>
        <select
          value={scenario}
          onChange={(e) => onSelectScenario(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5] text-[#183B32] text-xs font-mono focus:outline-none focus:border-[#075442] transition-colors"
        >
          <option value="Mixed Workload">Mixed Workload</option>
          <option value="Heavy Batch ETL Surge">Heavy Batch ETL Surge</option>
          <option value="Low-Latency Realtime Inference">Low-Latency Realtime Inference</option>
          <option value="Global Peak Solar Alignment">Global Peak Solar Alignment</option>
        </select>
      </div>

      {/* Select Strategies Checkboxes */}
      <div className="space-y-2.5">
        <label className="block text-xs font-semibold text-[#183B32] font-mono">
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
                    ? "bg-[#FFFDF8] border-[#075442] text-[#075442] font-bold shadow-xs"
                    : "bg-[#FFF8EB] border-[#DCCFB5] text-[#486256] opacity-75"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                      isChecked
                        ? "bg-[#075442] border-[#075442] text-[#FFF8EB]"
                        : "border-[#DCCFB5] bg-[#FFFDF8]"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span>{s.label}</span>
                </div>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Workload Count & Seed */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#DCCFB5]">
        <div>
          <label className="block text-xs font-semibold text-[#183B32] mb-1 font-mono">
            Workload Count
          </label>
          <input
            type="number"
            min="5"
            max="100"
            value={workloadCount}
            onChange={(e) => setWorkloadCount(parseInt(e.target.value) || 30)}
            className="w-full px-3 py-2 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5] text-[#183B32] text-xs font-mono focus:outline-none focus:border-[#075442]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#183B32] mb-1 font-mono">
            Random Seed
          </label>
          <input
            type="number"
            min="1"
            max="9999"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5] text-[#183B32] text-xs font-mono focus:outline-none focus:border-[#075442]"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-[#075442] hover:bg-[#063B30] text-[#FFF8EB] font-bold text-xs font-sans transition cursor-pointer shadow-md shadow-[#075442]/20 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Play className="w-3.5 h-3.5 fill-current" />
        {loading ? "Simulating Benchmark..." : "Execute Parameterized Run"}
      </button>
    </form>
  );
}
