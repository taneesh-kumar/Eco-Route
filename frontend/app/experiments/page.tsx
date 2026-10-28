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
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { History, BookOpen, Play } from "lucide-react";

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentResponse[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState<ExperimentResponse | null>(null);
  const [results, setResults] = useState<ExperimentResultResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [benchmarking, setBenchmarking] = useState(false);
  const [scenario, setScenario] = useState("Mixed Workload");
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

  if (loading) {
    return (
      <LoadingScreen
        message="Loading Benchmarks & Simulation Results..."
        submessage="Retrieving multi-variant experiment runs and historical metrics"
      />
    );
  }

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#DCCFB5]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#075442] bg-[#075442]/10 px-2.5 py-0.5 rounded-full border border-[#075442]/20 font-semibold">
              Controlled Simulation
            </span>
            <span className="text-[#A5BDAA]">&bull;</span>
            <span className="text-xs text-[#63786C] font-mono">Counterfactual Evaluation</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#075442]">
            Simulation &amp; Benchmarks
          </h1>
          <p className="text-sm text-[#486256] mt-1.5 max-w-2xl">
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
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#075442] hover:bg-[#063B30] text-[#FFF8EB] font-bold text-xs font-sans transition cursor-pointer shadow-md shadow-[#075442]/20 disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-current" />
            {benchmarking ? "Simulating..." : "Run Simulation"}
          </button>
        </div>
      </div>

      {/* Main benchmark workspace */}
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
        <div className="ecoroute-card flex items-center gap-3 p-4 sm:p-5 shadow-xs overflow-x-auto">
          <span className="text-xs text-[#63786C] font-mono shrink-0 flex items-center gap-1.5 font-semibold">
            <History className="w-3.5 h-3.5 text-[#075442]" /> Past Experiments:
          </span>
          {experiments.map((exp) => (
            <button
              key={exp.id}
              onClick={() => handleSelectExperiment(exp)}
              className={`px-3 py-1.5 rounded-full text-xs font-mono transition shrink-0 cursor-pointer ${
                selectedExperiment?.id === exp.id
                  ? "bg-[#075442] text-[#FFF8EB] font-bold shadow-xs"
                  : "bg-[#FFFDF8] text-[#486256] hover:text-[#075442] border border-[#DCCFB5]"
              }`}
            >
              {exp.name} (Seed: {exp.random_seed})
            </button>
          ))}
        </div>
      )}

      {/* Methodology note */}
      <div className="ecoroute-card p-6 sm:p-7 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-[#075442] uppercase tracking-wider font-mono flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#075442]" /> Simulation Methodology &amp; Mathematical Invariants
        </h3>
        <ul className="text-xs text-[#486256] space-y-2 list-disc pl-5 leading-relaxed font-sans">
          <li>
            <strong className="text-[#183B32]">Cloned Scenario Isolation:</strong> All 5 scheduler strategies evaluate byte-identical cloned scenario instances with zero state mutation leakage across runs.
          </li>
          <li>
            <strong className="text-[#183B32]">Zero Network Timing Bias:</strong> Workloads are simulated using deterministic analytical formulas rather than live message queues to eliminate asynchronous networking jitter.
          </li>
          <li>
            <strong className="text-[#183B32]">Zero Duplicate Executions:</strong> Exactly one attempt is processed per job per algorithm (<code className="text-[#075442] font-mono font-bold bg-[#075442]/10 px-1.5 py-0.5 rounded">duplicate_execution_count == 0</code>).
          </li>
          <li>
            <strong className="text-[#183B32]">Counterfactual Carbon Reduction:</strong> Savings percentage is calculated deterministically as <code className="text-[#075442] font-mono font-bold bg-[#075442]/10 px-1.5 py-0.5 rounded">(Emissions_conv - Emissions_eco) / Emissions_conv * 100</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}
