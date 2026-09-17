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
import { FlaskConical, History, Award, BookOpen } from "lucide-react";

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentResponse[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState<ExperimentResponse | null>(null);
  const [results, setResults] = useState<ExperimentResultResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [benchmarking, setBenchmarking] = useState(false);

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <FlaskConical className="w-6 h-6 text-emerald-400" /> Scientific Simulation &amp; Benchmarks
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Empirical comparative analysis of EcoRoute against Conventional, Carbon-Only, Performance-Only, and Random baselines.
          </p>
        </div>
      </div>

      {/* Benchmark Execution Form */}
      <BenchmarkRunner
        onRunBenchmark={handleRunBenchmark}
        loading={benchmarking}
      />

      {/* Past Experiment Selection Pills */}
      {experiments.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[#0e1424] border border-slate-800/80 overflow-x-auto">
          <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1.5 font-medium">
            <History className="w-3.5 h-3.5" /> Benchmarks:
          </span>
          {experiments.map((exp) => (
            <button
              key={exp.id}
              onClick={() => handleSelectExperiment(exp)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition shrink-0 cursor-pointer ${
                selectedExperiment?.id === exp.id
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-semibold"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {exp.name} (Seed: {exp.random_seed})
            </button>
          ))}
        </div>
      )}

      {/* Comparison Results */}
      <ComparisonChart results={results} />

      {/* Scientific Methodology Note */}
      <div className="p-6 rounded-xl bg-[#0e1424] border border-slate-800/80 space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-emerald-400" /> Simulation Methodology &amp; Invariants
        </h3>
        <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-5 font-sans leading-relaxed">
          <li>
            <strong className="text-slate-200">Cloned Scenario Isolation:</strong> All 5 scheduler strategies evaluate byte-identical cloned scenario instances with zero state mutation leakage across runs.
          </li>
          <li>
            <strong className="text-slate-200">Zero Network Timing Bias:</strong> Workloads are simulated using deterministic analytical formulas rather than live message queues to eliminate asynchronous networking jitter.
          </li>
          <li>
            <strong className="text-slate-200">Zero Duplicate Executions:</strong> Exactly one attempt is processed per job per algorithm (<code className="text-emerald-400 font-mono">duplicate_execution_count == 0</code>).
          </li>
          <li>
            <strong className="text-slate-200">Counterfactual Carbon Reduction:</strong> Savings percentage is calculated deterministically as <code className="text-emerald-400 font-mono">(Emissions_conv - Emissions_eco) / Emissions_conv * 100</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}
