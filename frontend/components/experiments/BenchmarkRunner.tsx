"use client";

import { useState } from "react";
import { ExperimentCreatePayload } from "@/lib/types";
import { FlaskConical, Play, CheckCircle2, Sliders } from "lucide-react";

interface BenchmarkRunnerProps {
  onRunBenchmark: (payload: ExperimentCreatePayload) => Promise<void>;
  loading?: boolean;
}

export function BenchmarkRunner({
  onRunBenchmark,
  loading = false,
}: BenchmarkRunnerProps) {
  const [name, setName] = useState("Academic Carbon Comparison Run #1");
  const [workloadCount, setWorkloadCount] = useState(30);
  const [seed, setSeed] = useState(42);
  const [scenarioType, setScenarioType] = useState("DEFAULT_GLOBAL_TOPOLOGY");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRunBenchmark({
      name,
      workload_count: workloadCount,
      random_seed: seed,
      scenario_type: scenarioType,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 rounded-xl bg-[#0e1424] border border-slate-800/80 shadow-md space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-emerald-400" /> Scientific Simulation Experiment
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Run a controlled benchmark across 5 scheduler variants on cloned regional scenarios.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Experiment Title */}
        <div className="lg:col-span-2">
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Experiment Title
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        {/* Workload Population Count */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Workload Population Size: <span className="font-mono text-emerald-400">{workloadCount}</span>
          </label>
          <input
            type="number"
            min="5"
            max="100"
            value={workloadCount}
            onChange={(e) => setWorkloadCount(parseInt(e.target.value) || 10)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        {/* Deterministic Seed */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Frozen PRNG Seed
          </label>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
      </div>

      {/* Strategies Being Benchmarked */}
      <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800/80">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono block mb-2">
          Evaluating 5 Isolated Algorithms on Deep-Cloned Topology:
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
          <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
            1. EcoRoute
          </div>
          <div className="p-2 rounded bg-slate-800 border border-slate-700 text-slate-300">
            2. Conventional
          </div>
          <div className="p-2 rounded bg-slate-800 border border-slate-700 text-slate-300">
            3. Carbon-Only
          </div>
          <div className="p-2 rounded bg-slate-800 border border-slate-700 text-slate-300">
            4. Perf-Only
          </div>
          <div className="p-2 rounded bg-slate-800 border border-slate-700 text-slate-300">
            5. Random
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-medium text-sm rounded-lg transition-all shadow-md cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Running Cloned Simulation...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" /> Execute 5-Way Benchmark
            </>
          )}
        </button>
      </div>
    </form>
  );
}
