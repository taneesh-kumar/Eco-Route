"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  ExperimentCreatePayload,
  ExperimentResponse,
  ExperimentResultResponse,
} from "@/lib/types";
import { BenchmarkRunner } from "@/components/experiments/BenchmarkRunner";
import { ComparisonChart } from "@/components/experiments/ComparisonChart";
import { FlaskConical, History, BookOpen, Play } from "lucide-react";

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentResponse[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState<ExperimentResponse | null>(null);
  const [results, setResults] = useState<ExperimentResultResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [benchmarking, setBenchmarking] = useState(false);
  const [scenario, setScenario] = useState("Mixed Workload (Default)");
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([
    "ECOROUTE",
    "CONVENTIONAL",
    "CARBON_ONLY",
    "PERFORMANCE_ONLY",
    "RANDOM",
  ]);

  const toggleStrategy = (strat: string) => {
    if (selectedStrategies.includes(strat)) {
      if (selectedStrategies.length > 1) {
        setSelectedStrategies(selectedStrategies.filter((s) => s !== strat));
      }
    } else {
      setSelectedStrategies([...selectedStrategies, strat]);
    }
  };

  const loadExperiments = async () => {
    try {
      const exps = await apiClient.getExperiments(20);
      setExperiments(exps);

      if (exps.length > 0) {
        const first = exps[0];
        setSelectedExperiment(first);
        const res = await apiClient.getExperimentResults(first.id);
        setResults(res);
      }
    } catch (err) {
      console.error("Failed to load experiments:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExperiments();
  }, []);

  const handleSelectExperiment = async (exp: ExperimentResponse) => {
    setSelectedExperiment(exp);
    try {
      const res = await apiClient.getExperimentResults(exp.id);
      setResults(res);
    } catch (err) {
      console.error("Failed to load experiment results:", err);
    }
  };

  const handleRunBenchmark = async (payload: ExperimentCreatePayload) => {
    setBenchmarking(true);
    try {
      const exp = await apiClient.createExperiment(payload);
      const res = await apiClient.getExperimentResults(exp.id);
      setSelectedExperiment(exp);
      setResults(res);
      await loadExperiments();
    } catch (err) {
      console.error("Failed to run benchmark:", err);
    } finally {
      setBenchmarking(false);
    }
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#22c55e] bg-[#22c55e]/10 px-2.5 py-0.5 rounded-md border border-[#22c55e]/30 font-semibold">
              Controlled Simulation
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-xs text-slate-400 font-mono">Counterfactual Evaluation</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Simulation &amp; <span className="text-[#22c55e]">Benchmarks</span>
          </h1>
          <p className="text-sm text-slate-300 mt-1.5 max-w-2xl">
            Compare scheduling strategies and measure real-time carbon, energy, and latency impact.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              handleRunBenchmark({
                name: `${scenario} - Live Execution`,
                workload_count: 30,
                random_seed: Math.floor(Math.random() * 1000),
                scenario_type: scenario,
              })
            }
            disabled={benchmarking}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-slate-950 font-bold text-xs font-sans transition cursor-pointer shadow-lg shadow-emerald-950/40 disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-current" />
            {benchmarking ? "Simulating..." : "Run Simulation"}
          </button>
        </div>
      </div>

      {/* Main Split Simulation Laboratory (Matches Mockup #3) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Control Panel (4 cols) */}
        <div className="lg:col-span-4">
          <BenchmarkRunner
            onRunBenchmark={handleRunBenchmark}
            loading={benchmarking}
            selectedStrategies={selectedStrategies}
            onToggleStrategy={toggleStrategy}
            scenario={scenario}
            onSelectScenario={setScenario}
          />
        </div>

        {/* Right Multi-Line Chart & Summary Metrics (8 cols) */}
        <div className="lg:col-span-8">
          <ComparisonChart results={results} selectedStrategies={selectedStrategies} />
        </div>
      </div>

      {/* Past Experiment Selection Pills */}
      {experiments.length > 0 && (
        <div className="glass-panel flex items-center gap-3 p-4 sm:p-5 rounded-2xl border border-white/[0.08] overflow-x-auto">
          <span className="text-xs text-slate-400 font-mono shrink-0 flex items-center gap-1.5 font-medium">
            <History className="w-3.5 h-3.5 text-[#22c55e]" /> Past Experiments:
          </span>
          {experiments.map((exp) => (
            <button
              key={exp.id}
              onClick={() => handleSelectExperiment(exp)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition shrink-0 cursor-pointer ${
                selectedExperiment?.id === exp.id
                  ? "bg-[#22c55e] text-slate-950 font-bold shadow-md shadow-emerald-950/40"
                  : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {exp.name} (Seed: {exp.random_seed})
            </button>
          ))}
        </div>
      )}

      {/* Scientific Methodology Note */}
      <div className="glass-panel p-6 sm:p-7 rounded-2xl border border-white/[0.08] space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#22c55e]" /> Simulation Methodology &amp; Mathematical Invariants
        </h3>
        <ul className="text-xs text-slate-400 space-y-2 list-disc pl-5 leading-relaxed">
          <li>
            <strong className="text-slate-200">Cloned Scenario Isolation:</strong> All 5 scheduler strategies evaluate byte-identical cloned scenario instances with zero state mutation leakage across runs.
          </li>
          <li>
            <strong className="text-slate-200">Zero Network Timing Bias:</strong> Workloads are simulated using deterministic analytical formulas rather than live message queues to eliminate asynchronous networking jitter.
          </li>
          <li>
            <strong className="text-slate-200">Zero Duplicate Executions:</strong> Exactly one attempt is processed per job per algorithm (<code className="text-[#22c55e] font-mono font-bold">duplicate_execution_count == 0</code>).
          </li>
          <li>
            <strong className="text-slate-200">Counterfactual Carbon Reduction:</strong> Savings percentage is calculated deterministically as <code className="text-[#22c55e] font-mono font-bold">(Emissions_conv - Emissions_eco) / Emissions_conv * 100</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}
