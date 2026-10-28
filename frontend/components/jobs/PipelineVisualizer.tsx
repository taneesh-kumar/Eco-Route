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
  title: string;
  subtitle: string;
  details: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function PipelineVisualizer({
  isSubmitting = false,
  workloadName = "New workload",
  workloadType = "BATCH",
  cpuCores = 0,
  memoryGb = 0,
  duration = 0,
  deadlineOffset = 0,
  priority = 5,
}: PipelineVisualizerProps) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  const dynamicSteps: StepInfo[] = [
    {
      num: 1,
      title: `Analyzing ${workloadName}`,
      subtitle: `${cpuCores} vCPU • ${memoryGb} GB RAM • Priority ${priority}`,
      details: `Validating demand profile (${cpuCores} cores, ${memoryGb} GB) and calculating slack margin (${deadlineOffset}s buffer)`,
      icon: Cpu,
    },
    {
      num: 2,
      title: "Querying Grid Carbon Telemetry",
      subtitle: "Electricity Maps real-time signal stream",
      details: `Fetching live gCO₂/kWh across available regions for ${workloadType.toLowerCase()} execution window`,
      icon: Globe,
    },
    {
      num: 3,
      title: "Evaluating Regional Hard Constraints",
      subtitle: `Feasibility check for ${duration}s run time`,
      details: `Testing host capacity >= ${cpuCores} cores, RAM >= ${memoryGb} GB, and ETA <= deadline`,
      icon: Sliders,
    },
    {
      num: 4,
      title: "Multi-Objective Ranking ($J_r$)",
      subtitle: "Minimizing Carbon, Time, Util & Latency",
      details: "Applying the scheduler configuration recorded for this workload",
      icon: Sparkles,
    },
    {
      num: 5,
      title: "Atomic Dispatch to Worker Queue",
      subtitle: "Zero duplicate execution guarantee",
      details: `Enqueuing ${workloadName} with durable CAS claim & idempotency token`,
      icon: Zap,
    },
  ];

  const pipelineSteps = dynamicSteps;

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

  const isRunning = isSubmitting || isSimulating;

  return (
    <div className="ecoroute-card p-6 sm:p-7 shadow-xs flex flex-col justify-between relative overflow-hidden font-sans">
      <div className="relative z-10 space-y-6">
        {/* Header with Live Signal Badge & Simulate Button */}
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#DCCFB5]">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#075442] font-bold">
              <span className="relative flex h-2 w-2">
                {isRunning ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#075442] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#075442]" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#075442]" />
                )}
              </span>
              <span>{isRunning ? "Scheduling in progress" : "Scheduling workflow"}</span>
            </div>
            <h3 className="text-xl font-extrabold text-[#075442] mt-1 tracking-tight">
              What Happens Next?
            </h3>
            <p className="text-xs text-[#63786C] mt-0.5">
              {isRunning
                ? "Evaluating current grid data and dispatch requirements..."
                : "Reviewing workload requirements, regional limits, and dispatch status."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsSimulating(true);
            }}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFFDF8] hover:bg-[#F4E4C4] disabled:opacity-50 text-[#183B32] border border-[#DCCFB5] text-xs font-mono font-semibold transition cursor-pointer shadow-xs"
            title="Preview Execution Flow"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-[#075442] ${isRunning ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{isRunning ? "Running" : "Preview"}</span>
          </button>
        </div>

        {/* 5-Step Pipeline Execution Flow */}
        <div className="space-y-3 relative">
          {/* Vertical Bus Conduit */}
          <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-[#DCCFB5] -z-0">
            <div
              className="w-full bg-[#075442] transition-all duration-300"
              style={{
                height: `${((activeStep - 1) / 4) * 100}%`,
              }}
            />
          </div>

          {pipelineSteps.map((step) => {
            const isDone = step.num < activeStep;
            const isCurrent = step.num === activeStep;

            return (
              <div
                key={step.num}
                onClick={() => setActiveStep(step.num)}
                className={`flex items-start gap-3.5 relative z-10 group cursor-pointer transition-all duration-200 ${
                  isCurrent ? "scale-[1.01]" : ""
                }`}
              >
                {/* Step Node */}
                <div className="relative shrink-0 mt-1">
                  <div
                    className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs font-bold transition-all duration-200 shadow-xs ${
                      isDone
                        ? "bg-[#075442] border-[#075442] text-[#FFF8EB]"
                        : isCurrent
                        ? "bg-[#063B30] border-[#075442] text-[#FFF8EB] ring-3 ring-[#075442]/20"
                        : "bg-[#FFFDF8] border-[#DCCFB5] text-[#A5BDAA]"
                    }`}
                  >
                    {isDone ? (
                      <Check className="w-4 h-4 stroke-[3]" />
                    ) : (
                      step.num
                    )}
                  </div>
                </div>

                {/* Step Information Card */}
                <div
                  className={`p-3 sm:p-3.5 rounded-2xl border text-xs font-mono w-full transition-all duration-200 relative overflow-hidden ${
                    isCurrent
                      ? "bg-[#FFFDF8] border-[#075442] text-[#183B32] shadow-sm"
                      : isDone
                      ? "bg-[#FFF8EB] border-[#DCCFB5] text-[#486256]"
                      : "bg-[#F8EEDC]/50 border-[#EADBCE] text-[#8EA396] opacity-75"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-bold font-sans ${
                        isCurrent ? "text-[#075442] text-[13px]" : isDone ? "text-[#183B32]" : "text-[#63786C]"
                      }`}
                    >
                      {step.title}
                    </span>

                    {isCurrent ? (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#075442] text-[#FFF8EB] font-bold">
                        Active
                      </span>
                    ) : isDone ? (
                      <span className="text-[10px] text-[#075442] flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={`mt-1 text-[11px] font-sans ${
                      isCurrent ? "text-[#486256]" : "text-[#63786C]"
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

      {/* Footer */}
      <div className="pt-4 mt-6 border-t border-[#DCCFB5] text-[11px] font-mono text-[#63786C] flex items-center justify-between relative z-10">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#075442]" />
          Durable State Protection
        </span>
        <span className="text-[#075442] font-semibold">Auditable Telemetry Policy</span>
      </div>
    </div>
  );
}
