"use client";

import { useState } from "react";
import { JobCreatePayload, WorkloadType } from "@/lib/types";
import { Cpu, Clock, Layers, Sliders, Send, Check, ShieldAlert, Sparkles } from "lucide-react";

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
    priClass: "HIGH" | "MEDIUM" | "LOW";
    offset: number;
    wCarbon: number;
    wTime: number;
    wUtil: number;
    wLatency: number;
  }
> = {
  BATCH: {
    name: "batch-analytics-etl",
    type: "BATCH",
    cpu: 4,
    mem: 16,
    dur: 15,
    pri: 5,
    priClass: "MEDIUM",
    offset: 3600,
    wCarbon: 0.5,
    wTime: 0.2,
    wUtil: 0.2,
    wLatency: 0.1,
  },
  INFERENCE: {
    name: "realtime-llm-inference",
    type: "INFERENCE",
    cpu: 2,
    mem: 8,
    dur: 5,
    pri: 2,
    priClass: "HIGH",
    offset: 120,
    wCarbon: 0.1,
    wTime: 0.3,
    wUtil: 0.1,
    wLatency: 0.5,
  },
  TRAINING: {
    name: "transformer-training-step",
    type: "TRAINING",
    cpu: 16,
    mem: 64,
    dur: 30,
    pri: 9,
    priClass: "LOW",
    offset: 7200,
    wCarbon: 0.6,
    wTime: 0.15,
    wUtil: 0.15,
    wLatency: 0.1,
  },
};

export function WorkloadForm({ onSubmit, loading = false }: WorkloadFormProps) {
  const [workloadName, setWorkloadName] = useState("batch-data-pipeline-01");
  const [workloadType, setWorkloadType] = useState<WorkloadType>("BATCH");
  const [cpuCores, setCpuCores] = useState(4);
  const [memoryGb, setMemoryGb] = useState(16);
  const [duration, setDuration] = useState(15);
  const [priority, setPriority] = useState(5);
  const [priorityClass, setPriorityClass] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [deadlineOffset, setDeadlineOffset] = useState(600);
  const [maxRetries, setMaxRetries] = useState(3);

  const handlePriorityChange = (val: number) => {
    const num = Math.max(1, Math.min(10, val));
    setPriority(num);
    if (num <= 3) {
      setPriorityClass("HIGH");
    } else if (num <= 7) {
      setPriorityClass("MEDIUM");
    } else {
      setPriorityClass("LOW");
    }
  };

  const handlePriorityClassChange = (cls: "HIGH" | "MEDIUM" | "LOW") => {
    setPriorityClass(cls);
    if (cls === "HIGH") {
      setPriority(2);
    } else if (cls === "MEDIUM") {
      setPriority(5);
    } else {
      setPriority(9);
    }
  };

  // Multi-objective weights (sum = 1.0)
  const [carbonWeight, setCarbonWeight] = useState(0.4);
  const [timeWeight, setTimeWeight] = useState(0.2);
  const [utilWeight, setUtilWeight] = useState(0.2);
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
    setPriorityClass(p.priClass);
    setDeadlineOffset(p.offset);
    setCarbonWeight(p.wCarbon);
    setTimeWeight(p.wTime);
    setUtilWeight(p.wUtil);
    setLatencyWeight(p.wLatency);
  };

  const weightSum = Math.round((carbonWeight + timeWeight + utilWeight + latencyWeight) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sum = carbonWeight + timeWeight + utilWeight + latencyWeight;
    const finalCarbon = Math.round((carbonWeight / sum) * 1000) / 1000;
    const finalTime = Math.round((timeWeight / sum) * 1000) / 1000;
    const finalUtil = Math.round((utilWeight / sum) * 1000) / 1000;
    const finalLatency = Math.round((1.0 - finalCarbon - finalTime - finalUtil) * 1000) / 1000;

    await onSubmit({
      workload_name: workloadName,
      workload_type: workloadType,
      cpu_cores: cpuCores,
      memory_gb: memoryGb,
      estimated_duration_seconds: duration,
      priority,
      priority_class: priorityClass,
      deadline_offset_seconds: deadlineOffset,
      max_retries: maxRetries,
      carbon_weight: finalCarbon,
      time_weight: finalTime,
      utilization_weight: finalUtil,
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
            Submit a simulated compute demand profile with multi-objective tradeoffs ($J_r$) and carbon deferral policies.
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
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
            <option value="BATCH">BATCH (Delay-Tolerant, ETL)</option>
            <option value="INFERENCE">INFERENCE (Latency-Critical, Realtime)</option>
            <option value="TRAINING">TRAINING (Compute-Intensive)</option>
          </select>
        </div>

        {/* Priority Class Policy */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Priority Class (Carbon Policy)
          </label>
          <select
            value={priorityClass}
            onChange={(e) => handlePriorityClassChange(e.target.value as "HIGH" | "MEDIUM" | "LOW")}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
          >
            <option value="HIGH">HIGH (Urgent: 1-3, No Deferral)</option>
            <option value="MEDIUM">MEDIUM (Balanced: 4-7)</option>
            <option value="LOW">LOW (Tolerant: 8-10, Defer on Peak)</option>
          </select>
        </div>

        {/* Priority Value */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Numeric Priority (1 - 10)
          </label>
          <input
            type="number"
            min="1"
            max="10"
            required
            value={priority}
            onChange={(e) => handlePriorityChange(parseInt(e.target.value) || 1)}
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
            Base Execution Duration (Seconds)
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
            Deadline Slack (Seconds)
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
      </div>

      {/* Multi-Objective Optimization Weights */}
      <div className="pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">
              Multi-Objective Tradeoff Weights: <span className="font-mono text-emerald-400">J_r = w_C·N(C) + w_T·N(T) + w_U·N(U) + w_L·N(L)</span>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-emerald-400 font-medium">w_C (Carbon Impact)</span>
              <span className="font-mono text-white">{carbonWeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={carbonWeight}
              onChange={(e) => setCarbonWeight(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-blue-400 font-medium">w_T (Execution Time)</span>
              <span className="font-mono text-white">{timeWeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={timeWeight}
              onChange={(e) => setTimeWeight(parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-purple-400 font-medium">w_U (Capacity Balance)</span>
              <span className="font-mono text-white">{utilWeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={utilWeight}
              onChange={(e) => setUtilWeight(parseFloat(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer"
            />
          </div>

          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-cyan-400 font-medium">w_L (Network Latency)</span>
              <span className="font-mono text-white">{latencyWeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={latencyWeight}
              onChange={(e) => setLatencyWeight(parseFloat(e.target.value))}
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
