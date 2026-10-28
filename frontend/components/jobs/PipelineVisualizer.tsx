"use client";

import { useState, useEffect } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Globe,
  Sliders,
  Check,
  Zap,
  RotateCcw,
  Sparkles,
} from "lucide-react";

interface PipelineVisualizerProps {
  isSubmitting?: boolean;
  onStepComplete?: (step: number) => void;
  workloadName?: string;
  workloadType?: string;
  cpuCores?: number;
  memoryGb?: number;
  duration?: number;
  deadlineOffset?: number;
  priority?: number;
}

interface StepInfo {
  num: number;
  stageName: string;
  title: string;
  subtitle: string;
  details: string;
  icon: React.ComponentType<{ className?: string }>;
}

const pipelineSteps: StepInfo[] = [
  {
    num: 1,
    stageName: "Intake & Demand",
    title: "Analyzing workload requirements",
    subtitle: "vCPU, RAM, SLA deadline slack",
    details: "Parsing 8 vCPU / 32 GB demand & calculating SLA margin",
    icon: Cpu,
  },
  {
    num: 2,
    stageName: "Telemetry Ingestion",
    title: "Fetching real-time carbon data",
    subtitle: "Electricity Maps REST API stream",
    details: "Live grid intensity: IN-WE (71 gCO₂), EU-West (62 gCO₂)",
    icon: Globe,
  },
  {
    num: 3,
    stageName: "Optimization & Scoring",
    title: "Evaluating candidate regions",
    subtitle: "Multi-objective Jr composite scoring",
    details: "Min-Max normalization across 7 global cluster nodes",
    icon: Sliders,
  },
  {
    num: 4,
    stageName: "Placement Selection",
    title: "Selecting optimal region",
    subtitle: "Winner: IN-WE (Score: 0.81)",
    details: "Optimal trade-off: 48% carbon reduction, 142ms latency",
    icon: Sparkles,
  },
  {
    num: 5,
    stageName: "Durable Dispatch",
    title: "Dispatching to execution queue",
    subtitle: "Durable PostgreSQL CAS claim",
    details: "Enqueued to Redis worker with zero duplicate execution",
    icon: Zap,
  },
];

export function PipelineVisualizer({
  isSubmitting = false,
  workloadName = "vision-training-02",
  workloadType = "TRAINING",
  cpuCores = 8,
  memoryGb = 32,
  duration = 20,
  deadlineOffset = 1800,
  priority = 5,
}: PipelineVisualizerProps) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Dynamically generated steps reflecting the actual workload being configured/deployed
  const dynamicSteps: StepInfo[] = [
    {
      num: 1,
      stageName: "Intake & Demand",
      title: `Analyzing ${workloadName}`,
      subtitle: `${cpuCores} vCPU • ${memoryGb} GB RAM • Priority ${priority}`,
      details: `Validating demand profile (${cpuCores} cores, ${memoryGb} GB) and calculating slack margin (${deadlineOffset}s buffer)`,
      icon: Cpu,
    },
    {
      num: 2,
      stageName: "Telemetry Ingestion",
      title: "Querying Grid Carbon Telemetry",
      subtitle: "Electricity Maps real-time signal stream",
      details: `Fetching live gCO₂/kWh across available regions for ${workloadType.toLowerCase()} execution window`,
      icon: Globe,
    },
    {
      num: 3,
      stageName: "Constraint Filtering",
      title: "Evaluating Regional Hard Constraints",
      subtitle: `Feasibility check for ${duration}s run time`,
      details: `Testing host capacity >= ${cpuCores} cores, RAM >= ${memoryGb} GB, and ETA <= deadline`,
      icon: Sliders,
    },
    {
      num: 4,
      stageName: "Optimization & Scoring",
      title: "Multi-Objective Ranking ($J_r$)",
      subtitle: "Minimizing Carbon, Time, Util & Latency",
      details: `Scoring feasible candidates with weights: w_C(0.40), w_T(0.30), w_U(0.20), w_L(0.10)`,
      icon: Sparkles,
    },
    {
      num: 5,
      stageName: "Durable Dispatch",
      title: "Atomic Dispatch to Worker Queue",
      subtitle: "Zero duplicate execution guarantee",
      details: `Enqueuing ${workloadName} with durable PostgreSQL CAS claim & idempotency token`,
      icon: Zap,
    },
  ];

  const pipelineSteps = dynamicSteps;

  // Execution flow animation: triggers during active submission or preview
  useEffect(() => {
    if (!isSubmitting && !isSimulating) return;

    setActiveStep(1);
    let current = 1;
    const interval = setInterval(() => {
      current += 1;
      if (current > 5) {
        clearInterval(interval);
        setIsSimulating(false);
      } else {
        setActiveStep(current);
      }
    }, 700);

    return () => clearInterval(interval);
  }, [isSubmitting, isSimulating]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only apply 3D tilt on desktop viewports
    if (typeof window !== "undefined" && window.innerWidth < 1024) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 10;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -10;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  const isRunning = isSubmitting || isSimulating;

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${mousePos.y}deg) rotateY(${mousePos.x}deg)`,
        transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className="glass-panel p-5 sm:p-7 rounded-2xl sm:rounded-3xl border border-white/[0.1] shadow-2xl flex flex-col justify-between relative overflow-hidden will-change-transform font-sans"
    >
      {/* Top 3D Specular Rim Line */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#22c55e]/50 via-cyan-400/40 to-transparent pointer-events-none" />

      {/* Atmospheric Background Planetary Glow */}
      <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-5">
        {/* Header with Live Signal Badge & Preview Button */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#22c55e] font-bold">
              <span className="relative flex h-2 w-2">
                {isRunning ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22c55e]" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22c55e]/80" />
                )}
              </span>
              <span>{isRunning ? "Evaluating Lifecycle..." : "Autonomous Pipeline"}</span>
            </div>
            <h3 className="text-lg sm:text-xl font-extrabold text-white mt-1 tracking-tight">
              Workload Lifecycle Pipeline
            </h3>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              5-stage multi-objective carbon optimization &amp; dispatch lifecycle.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsSimulating(true)}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 disabled:opacity-50 text-slate-200 text-xs font-mono font-semibold transition cursor-pointer border border-slate-700 shadow-md shrink-0"
            title="Preview Execution Flow"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 text-[#22c55e] ${isRunning ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">{isRunning ? "Running" : "Preview"}</span>
          </button>
        </div>

        {/* 5-Step Pipeline Execution Flow */}
        <div className="space-y-3 relative">
          {/* Vertical Bus Conduit */}
          <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-800/80 -z-0">
            {/* Active Photon Fill */}
            <div
              className="w-full bg-gradient-to-b from-[#22c55e] via-emerald-400 to-[#22c55e] transition-all duration-300 shadow-[0_0_8px_#22c55e]"
              style={{
                height: `${((activeStep - 1) / 4) * 100}%`,
              }}
            />
          </div>

          {pipelineSteps.map((step) => {
            const isDone = step.num < activeStep;
            const isCurrent = step.num === activeStep;
            const isUpcoming = step.num > activeStep;
            const Icon = step.icon;

            return (
              <div
                key={step.num}
                onClick={() => setActiveStep(step.num)}
                className={`flex items-start gap-3.5 relative z-10 group cursor-pointer transition-all duration-200 ${
                  isCurrent ? "scale-[1.01]" : "hover:translate-x-0.5"
                }`}
              >
                {/* Step Node */}
                <div className="relative shrink-0 mt-1">
                  <div
                    className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs font-bold transition-all duration-200 shadow-lg ${
                      isDone
                        ? "bg-[#22c55e] border-[#22c55e] text-slate-950 shadow-[0_0_12px_rgba(34,197,94,0.4)]"
                        : isCurrent
                        ? "bg-gradient-to-b from-emerald-500/30 to-slate-950 border-[#22c55e] text-emerald-300 shadow-[0_0_16px_rgba(34,197,94,0.5)]"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    {isDone ? (
                      <Check className="w-4 h-4 stroke-[3]" />
                    ) : (
                      step.num
                    )}
                  </div>

                  {/* Pulsing indicator for active step */}
                  {isCurrent && (
                    <div className="absolute -inset-1 rounded-full border border-[#22c55e]/50 animate-ping pointer-events-none" />
                  )}
                </div>

                {/* Step Information Card */}
                <div
                  className={`p-3 sm:p-3.5 rounded-2xl border text-xs w-full transition-all duration-200 relative overflow-hidden ${
                    isCurrent
                      ? "bg-gradient-to-b from-emerald-950/40 to-slate-950/80 border-[#22c55e]/60 text-white shadow-[0_8px_20px_rgba(34,197,94,0.15)]"
                      : isDone
                      ? "bg-slate-950/80 border-slate-800/90 text-slate-300"
                      : "bg-slate-950/40 border-slate-900 text-slate-400"
                  }`}
                >
                  {/* Shimmer sweep on active card */}
                  {isCurrent && (
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent -translate-x-full animate-shimmer pointer-events-none" />
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-900/80 text-slate-400 border border-slate-800">
                        {step.stageName || `Stage ${step.num}`}
                      </span>
                      <span
                        className={`font-bold font-sans ${
                          isCurrent
                            ? "text-emerald-300 text-sm"
                            : isDone
                            ? "text-slate-100"
                            : "text-slate-300"
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>

                    {/* Status Pill */}
                    {isCurrent ? (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#22c55e] text-slate-950 font-extrabold shadow-sm shrink-0">
                        In Progress
                      </span>
                    ) : isDone ? (
                      <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Done
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 uppercase font-mono shrink-0">
                        Upcoming
                      </span>
                    )}
                  </div>

                  <div
                    className={`mt-1.5 text-[11px] font-sans leading-relaxed ${
                      isCurrent
                        ? "text-slate-200"
                        : isDone
                        ? "text-slate-300"
                        : "text-slate-400"
                    }`}
                  >
                    {isCurrent ? step.details : step.subtitle}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Provenance */}
      <div className="pt-4 mt-5 border-t border-white/[0.08] text-[11px] font-mono text-slate-400 flex items-center justify-between relative z-10">
        <span className="flex items-center gap-1.5 text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-[#22c55e]" />
          PostgreSQL Row-Locking &amp; CAS
        </span>
        <span className="text-[#22c55e] font-semibold">Zero Fabrication</span>
      </div>
    </div>
  );
}
