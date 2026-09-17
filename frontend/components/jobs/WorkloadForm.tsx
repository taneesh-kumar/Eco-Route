"use client";

import { useState } from "react";
import { JobCreatePayload, WorkloadType } from "@/lib/types";
import { Cpu, Clock, Layers, Sliders, Send, Check } from "lucide-react";

interface WorkloadFormProps {
  onSubmit: (payload: JobCreatePayload) => Promise<void>;
  loading?: boolean;
}

const PRESETS: Record<
  string,
  {
    name: string;
    type: WorkloadType;
    cpu: number;
    mem: number;
    dur: number;
    pri: number;
    offset: number;
    wCarbon: number;
    wCost: number;
    wLatency: number;
  }
> = {
  BATCH: {
    name: "batch-analytics-etl",
    type: "BATCH",
    cpu: 8,
    mem: 32,
    dur: 600,
    pri: 5,
    offset: 1800,
    wCarbon: 0.6,
    wCost: 0.3,
    wLatency: 0.1,
  },
  INFERENCE: {
    name: "realtime-llm-inference",
    type: "INFERENCE",
    cpu: 2,
    mem: 8,
    dur: 15,
    pri: 9,
    offset: 45,
    wCarbon: 0.2,
    wCost: 0.2,
    wLatency: 0.6,
  },
  TRAINING: {
    name: "distributed-transformer-training",
    type: "TRAINING",
    cpu: 32,
    mem: 128,
    dur: 2400,
    pri: 4,
    offset: 4800,
    wCarbon: 0.7,
    wCost: 0.2,
    wLatency: 0.1,
  },
};

export function WorkloadForm({ onSubmit, loading = false }: WorkloadFormProps) {
  const [workloadName, setWorkloadName] = useState("workload-alpha-01");
  const [workloadType, setWorkloadType] = useState<WorkloadType>("BATCH");
  const [cpuCores, setCpuCores] = useState(8);
  const [memoryGb, setMemoryGb] = useState(32);
  const [duration, setDuration] = useState(600);
  const [priority, setPriority] = useState(5);
  const [deadlineOffset, setDeadlineOffset] = useState(1800);
  const [maxRetries, setMaxRetries] = useState(3);

  // Multi-objective weights
  const [carbonWeight, setCarbonWeight] = useState(0.5);
  const [costWeight, setCostWeight] = useState(0.3);
  const [latencyWeight, setLatencyWeight] = useState(0.2);
  const [submitted, setSubmitted] = useState(false);

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    setWorkloadName(p.name);
    setWorkloadType(p.type);
    setCpuCores(p.cpu);
    setMemoryGb(p.mem);
    setDuration(p.dur);
    setPriority(p.pri);
    setDeadlineOffset(p.offset);
    setCarbonWeight(p.wCarbon);
    setCostWeight(p.wCost);
    setLatencyWeight(p.wLatency);
  };

  const handleWeightChange = (
    changed: "carbon" | "cost" | "latency",
    val: number
  ) => {
    const rounded = Math.round(val * 100) / 100;
    if (changed === "carbon") {
      setCarbonWeight(rounded);
      const rem = Math.max(0, 1 - rounded);
      setCostWeight(Math.round((rem * 0.6) * 100) / 100);
      setLatencyWeight(Math.round((rem * 0.4) * 100) / 100);
    } else if (changed === "cost") {
      setCostWeight(rounded);
      const rem = Math.max(0, 1 - rounded);
      setCarbonWeight(Math.round((rem * 0.7) * 100) / 100);
      setLatencyWeight(Math.round((rem * 0.3) * 100) / 100);
    } else {
      setLatencyWeight(rounded);
      const rem = Math.max(0, 1 - rounded);
      setCarbonWeight(Math.round((rem * 0.6) * 100) / 100);
      setCostWeight(Math.round((rem * 0.4) * 100) / 100);
    }
  };

  const weightSum = Math.round((carbonWeight + costWeight + latencyWeight) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Normalize weights to sum exactly to 1.0
    const sum = carbonWeight + costWeight + latencyWeight;
    const finalCarbon = Math.round((carbonWeight / sum) * 1000) / 1000;
    const finalCost = Math.round((costWeight / sum) * 1000) / 1000;
    const finalLatency = Math.round((1.0 - finalCarbon - finalCost) * 1000) / 1000;

    await onSubmit({
      workload_name: workloadName,
      workload_type: workloadType,
      cpu_cores: cpuCores,
      memory_gb: memoryGb,
      estimated_duration_seconds: duration,
      priority,
      deadline_offset_seconds: deadlineOffset,
      max_retries: maxRetries,
      carbon_weight: finalCarbon,
      cost_weight: finalCost,
      latency_weight: finalLatency,
    });

    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2500);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 rounded-xl bg-[#0e1424] border border-slate-800/80 shadow-md space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" /> Workload Submission
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Submit a new cloud compute demand profile with multi-objective scheduling parameters.
          </p>
        </div>

        {/* Presets */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Presets:</span>
          {Object.keys(PRESETS).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer font-mono"
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Workload Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Workload Identifier
          </label>
          <input
            type="text"
            required
            value={workloadName}
            onChange={(e) => setWorkloadName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        {/* Workload Archetype */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Archetype Classification
          </label>
          <select
            value={workloadType}
            onChange={(e) => setWorkloadType(e.target.value as WorkloadType)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          >
            <option value="BATCH">BATCH (ETL, MapReduce, Crunching)</option>
            <option value="INFERENCE">INFERENCE (Latency-Critical, Realtime)</option>
            <option value="TRAINING">TRAINING (Deep Learning, Heavy Compute)</option>
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Priority Tier (1 - 10)
          </label>
          <input
            type="number"
            min="1"
            max="10"
            required
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        {/* Hardware Demand (CPU & Memory) */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Compute Demand (vCPU Cores)
          </label>
          <input
            type="number"
            min="1"
            max="128"
            required
            value={cpuCores}
            onChange={(e) => setCpuCores(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            RAM Demand (Gigabytes)
          </label>
          <input
            type="number"
            min="1"
            max="512"
            required
            value={memoryGb}
            onChange={(e) => setMemoryGb(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Estimated Duration (Seconds)
          </label>
          <input
            type="number"
            min="5"
            max="86400"
            required
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 5)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        {/* Deadline Slack Offset */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Deadline Slack Offset (Seconds from now)
          </label>
          <input
            type="number"
            min="10"
            max="604800"
            required
            value={deadlineOffset}
            onChange={(e) => setDeadlineOffset(parseInt(e.target.value) || 60)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        {/* Max Retries (Total attempt budget) */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Total Attempt Budget (max_retries)
          </label>
          <input
            type="number"
            min="1"
            max="5"
            required
            value={maxRetries}
            onChange={(e) => setMaxRetries(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
      </div>

      {/* Multi-Objective Optimization Weights */}
      <div className="pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">
              Multi-Objective Optimization Tradeoff Weights
            </span>
          </div>
          <span
            className={`text-xs font-mono font-semibold ${
              Math.abs(weightSum - 1.0) < 0.05 ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            Sum: {weightSum.toFixed(2)} / 1.00
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-emerald-400 font-medium">Carbon Priority</span>
              <span className="font-mono text-white">{carbonWeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={carbonWeight}
              onChange={(e) => handleWeightChange("carbon", parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-amber-400 font-medium">Cost Priority</span>
              <span className="font-mono text-white">{costWeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={costWeight}
              onChange={(e) => handleWeightChange("cost", parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-cyan-400 font-medium">Latency Priority</span>
              <span className="font-mono text-white">{latencyWeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={latencyWeight}
              onChange={(e) => handleWeightChange("latency", parseFloat(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-medium text-sm rounded-lg transition-all shadow-md cursor-pointer disabled:cursor-not-allowed"
        >
          {submitted ? (
            <>
              <Check className="w-4 h-4 text-emerald-200" /> Workload Enqueued!
            </>
          ) : (
            <>
              <Send className="w-4 h-4" /> Dispatch to EcoRoute Engine
            </>
          )}
        </button>
      </div>
    </form>
  );
}
