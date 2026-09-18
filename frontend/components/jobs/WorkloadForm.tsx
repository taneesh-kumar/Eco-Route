"use client";

import { useState } from "react";
import { JobCreatePayload, WorkloadType } from "@/lib/types";
import { PipelineVisualizer } from "./PipelineVisualizer";
import {
  Cpu,
  Clock,
  Layers,
  Sliders,
  Send,
  Check,
  ShieldCheck,
  Zap,
  Activity,
  Server,
  ArrowRight,
} from "lucide-react";

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
    name: "vision-training-02",
    type: "TRAINING",
    cpu: 16,
    mem: 64,
    dur: 30,
    pri: 8,
    priClass: "LOW",
    offset: 7200,
    wCarbon: 0.6,
    wTime: 0.15,
    wUtil: 0.15,
    wLatency: 0.1,
  },
};

export function WorkloadForm({ onSubmit, loading = false }: WorkloadFormProps) {
  const [workloadName, setWorkloadName] = useState("vision-training-02");
  const [workloadType, setWorkloadType] = useState<WorkloadType>("TRAINING");
  const [cpuCores, setCpuCores] = useState(8);
  const [memoryGb, setMemoryGb] = useState(32);
  const [duration, setDuration] = useState(20);
  const [priority, setPriority] = useState(5);
  const [priorityClass, setPriorityClass] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [deadlineOffset, setDeadlineOffset] = useState(1800);
  const [maxRetries, setMaxRetries] = useState(3);

  // Policy dropdown state
  const [carbonPolicy, setCarbonPolicy] = useState("Balanced (Default)");
  const [performanceConstraint, setPerformanceConstraint] = useState("Standard (Default)");

  // Multi-objective weights
  const [carbonWeight, setCarbonWeight] = useState(0.5);
  const [timeWeight, setTimeWeight] = useState(0.2);
  const [utilWeight, setUtilWeight] = useState(0.15);
  const [latencyWeight, setLatencyWeight] = useState(0.15);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handlePriorityChange = (val: string) => {
    if (val === "High") {
      setPriority(2);
      setPriorityClass("HIGH");
    } else if (val === "Medium") {
      setPriority(5);
      setPriorityClass("MEDIUM");
    } else {
      setPriority(8);
      setPriorityClass("LOW");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const sum = carbonWeight + timeWeight + utilWeight + latencyWeight;
    const finalCarbon = Math.round((carbonWeight / sum) * 1000) / 1000;
    const finalTime = Math.round((timeWeight / sum) * 1000) / 1000;
    const finalUtil = Math.round((utilWeight / sum) * 1000) / 1000;
    const finalLatency = Math.round((1.0 - finalCarbon - finalTime - finalUtil) * 1000) / 1000;

    try {
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
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch font-sans">
      {/* Left Column: Submit Workload Form (7 cols) */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-7 glass-panel p-6 sm:p-7 rounded-3xl border border-white/[0.09] shadow-2xl space-y-5"
      >
        <div className="pb-3 border-b border-white/[0.06]">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#22c55e] bg-[#22c55e]/10 px-2.5 py-0.5 rounded-md border border-[#22c55e]/30 font-semibold inline-block mb-1.5">
            Compute Demand Intake
          </div>
          <h2 className="text-xl font-bold text-white">Submit a New Workload</h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Define your compute requirements and let EcoRoute find the optimal region.
          </p>
        </div>

        {/* Workload Identifier */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
            Workload Identifier
          </label>
          <input
            type="text"
            required
            value={workloadName}
            onChange={(e) => setWorkloadName(e.target.value)}
            placeholder="e.g. vision-training-02"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-[#22c55e] transition-colors"
          />
        </div>

        {/* Workload Type Selector Pills */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
            Workload Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["BATCH", "INFERENCE", "TRAINING"] as const).map((t) => {
              const isSelected = workloadType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setWorkloadType(t);
                    applyPreset(t);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-mono font-bold transition flex items-center justify-center gap-2 cursor-pointer border ${
                    isSelected
                      ? "bg-emerald-500/20 text-[#22c55e] border-[#22c55e]"
                      : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isSelected ? "bg-[#22c55e]" : "bg-slate-700"
                    }`}
                  />
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Priority & Policy Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
              Priority
            </label>
            <select
              value={priority <= 3 ? "High" : priority <= 7 ? "Medium" : "Low"}
              onChange={(e) => handlePriorityChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-[#22c55e] transition-colors"
            >
              <option value="High">High (Urgent SLA)</option>
              <option value="Medium">Medium (Balanced)</option>
              <option value="Low">Low (Delay Tolerant)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
              Carbon Policy
            </label>
            <select
              value={carbonPolicy}
              onChange={(e) => setCarbonPolicy(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-[#22c55e] transition-colors"
            >
              <option value="Balanced (Default)">Balanced (Default)</option>
              <option value="Aggressive (Max Carbon)">Aggressive (Max Carbon)</option>
              <option value="Strict SLA First">Strict SLA First</option>
            </select>
          </div>
        </div>

        {/* Performance Constraints Dropdown */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
            Performance Constraints
          </label>
          <select
            value={performanceConstraint}
            onChange={(e) => setPerformanceConstraint(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-[#22c55e] transition-colors"
          >
            <option value="Standard (Default)">Standard (Default)</option>
            <option value="Ultra-Low Latency (<100ms)">Ultra-Low Latency (&lt;100ms)</option>
            <option value="High Throughput Batch">High Throughput Batch</option>
          </select>
        </div>

        {/* Hardware Capacity Specs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/[0.06] text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">vCPU Cores</span>
            <input
              type="number"
              min="1"
              max="128"
              value={cpuCores}
              onChange={(e) => setCpuCores(parseInt(e.target.value) || 1)}
              className="w-full bg-transparent font-bold text-white mt-0.5 focus:outline-none"
            />
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">RAM (GB)</span>
            <input
              type="number"
              min="1"
              max="512"
              value={memoryGb}
              onChange={(e) => setMemoryGb(parseInt(e.target.value) || 1)}
              className="w-full bg-transparent font-bold text-white mt-0.5 focus:outline-none"
            />
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">Est. Duration</span>
            <input
              type="number"
              min="5"
              max="86400"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 5)}
              className="w-full bg-transparent font-bold text-white mt-0.5 focus:outline-none"
            />
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">Slack (Sec)</span>
            <input
              type="number"
              min="10"
              max="604800"
              value={deadlineOffset}
              onChange={(e) => setDeadlineOffset(parseInt(e.target.value) || 60)}
              className="w-full bg-transparent font-bold text-white mt-0.5 focus:outline-none"
            />
          </div>
        </div>

        {/* Submit Workload Button */}
        <button
          type="submit"
          disabled={loading || isSubmitting}
          className="w-full py-3 bg-[#22c55e] hover:bg-[#16a34a] disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-bold text-xs font-sans rounded-xl transition-all shadow-lg shadow-emerald-950/50 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitted ? (
            <>
              <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
              Workload Enqueued!
            </>
          ) : (
            <>
              Submit Workload <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Right Column: Ultra-Realistic 3D Animated Pipeline Execution Visualizer */}
      <div className="lg:col-span-5 flex flex-col">
        <PipelineVisualizer isSubmitting={isSubmitting} />
      </div>
    </div>
  );
}
