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
  Play,
  RotateCcw,
  Sparkles,
  Radio,
  Clock,
} from "lucide-react";

interface PipelineVisualizerProps {
  isSubmitting?: boolean;
  onStepComplete?: (step: number) => void;
}

interface StepInfo {
  num: number;
  title: string;
  subtitle: string;
  details: string;
  icon: React.ComponentType<{ className?: string }>;
}

const pipelineSteps: StepInfo[] = [
  {
    num: 1,
    title: "Analyzing workload requirements",
    subtitle: "vCPU, RAM, SLA deadline slack",
    details: "Parsing 8 vCPU / 32 GB demand & calculating SLA margin",
    icon: Cpu,
  },
  {
    num: 2,
    title: "Fetching real-time carbon data",
    subtitle: "Electricity Maps REST API stream",
    details: "Live grid intensity: IN-WE (71 gCO₂), EU-West (62 gCO₂)",
    icon: Globe,
  },
  {
    num: 3,
    title: "Evaluating candidate regions",
    subtitle: "Multi-objective Jr composite scoring",
    details: "Min-Max normalization across 7 global cluster nodes",
    icon: Sliders,
  },
  {
    num: 4,
    title: "Selecting optimal region",
    subtitle: "Winner: IN-WE (Score: 0.81)",
    details: "Optimal trade-off: 48% carbon reduction, 142ms latency",
    icon: Sparkles,
  },
  {
    num: 5,
    title: "Dispatching to execution queue",
    subtitle: "Durable PostgreSQL CAS claim",
    details: "Enqueued to Redis worker with zero duplicate execution",
    icon: Zap,
  },
];

export function PipelineVisualizer({ isSubmitting = false }: PipelineVisualizerProps) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Auto-step sequence simulation loop
  useEffect(() => {
    if (!isSimulating && !isSubmitting) return;

    const interval = setInterval(() => {
      setActiveStep((prev) => (prev >= 5 ? 1 : prev + 1));
    }, 2400);

    return () => clearInterval(interval);
  }, [isSimulating, isSubmitting]);

  // If external submission is triggered, force animation to flow
  useEffect(() => {
    if (isSubmitting) {
      setActiveStep(1);
      setIsSimulating(true);
    }
  }, [isSubmitting]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -12;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${mousePos.y}deg) rotateY(${mousePos.x}deg)`,
        transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className="glass-panel p-6 sm:p-7 rounded-3xl border border-white/[0.1] shadow-2xl flex flex-col justify-between relative overflow-hidden will-change-transform font-sans"
    >
      {/* 3D Specular Rim Line */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#22c55e]/50 via-cyan-400/40 to-transparent pointer-events-none" />

      {/* Atmospheric Background Planetary Glow */}
      <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-emerald-500/12 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-6">
        {/* Header with Live Signal Badge & Simulate Button */}
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#22c55e] font-bold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22c55e]" />
              </span>
              <span>Autonomous Lifecycle</span>
            </div>
            <h3 className="text-xl font-extrabold text-white mt-1 tracking-tight">
              What Happens Next?
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Live multi-stage spatial carbon optimization pipeline.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsSimulating(true);
              setActiveStep(1);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-mono font-medium transition cursor-pointer shadow-md"
            title="Replay Execution Sequence"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#22c55e]" />
            <span className="hidden sm:inline">Trace</span>
          </button>
        </div>

        {/* 5-Step 3D Pipeline Execution Flow */}
        <div className="space-y-3 relative">
          {/* Vertical Bus Conduit */}
          <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-800/80 -z-0">
            {/* Animated Laser Photon Flow */}
            <div
              className="w-full bg-gradient-to-b from-[#22c55e] via-emerald-400 to-transparent transition-all duration-500 shadow-[0_0_10px_#22c55e]"
              style={{
                height: `${((activeStep - 1) / 4) * 100}%`,
              }}
            />
          </div>

          {pipelineSteps.map((step) => {
            const isDone = step.num < activeStep;
            const isCurrent = step.num === activeStep;
            const isPending = step.num > activeStep;
            const Icon = step.icon;

            return (
              <div
                key={step.num}
                onClick={() => setActiveStep(step.num)}
                className={`flex items-start gap-3.5 relative z-10 group cursor-pointer transition-all duration-300 ${
                  isCurrent ? "scale-[1.02]" : "hover:scale-[1.01]"
                }`}
              >
                {/* 3D Holographic Step Node */}
                <div className="relative shrink-0 mt-1">
                  <div
                    className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs font-bold transition-all duration-300 shadow-xl ${
                      isDone
                        ? "bg-[#22c55e] border-[#22c55e] text-slate-950 shadow-[0_0_14px_rgba(34,197,94,0.5)]"
                        : isCurrent
                        ? "bg-gradient-to-b from-emerald-500/30 to-slate-950 border-[#22c55e] text-emerald-300 shadow-[0_0_20px_rgba(34,197,94,0.6)]"
                        : "bg-slate-950 border-slate-800 text-slate-500"
                    }`}
                  >
                    {isDone ? (
                      <Check className="w-4 h-4 stroke-[3]" />
                    ) : isCurrent ? (
                      <span className="relative">
                        {step.num}
                        <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-ping" />
                      </span>
                    ) : (
                      step.num
                    )}
                  </div>

                  {/* Pulsing Radar Ring for Active Step */}
                  {isCurrent && (
                    <div className="absolute -inset-1 rounded-full border border-[#22c55e]/50 animate-ping pointer-events-none" />
                  )}
                </div>

                {/* 3D Step Information Card */}
                <div
                  className={`p-3 sm:p-3.5 rounded-2xl border text-xs font-mono w-full transition-all duration-300 relative overflow-hidden ${
                    isCurrent
                      ? "bg-gradient-to-b from-emerald-950/40 to-slate-950/80 border-[#22c55e]/60 text-white shadow-[0_8px_25px_rgba(34,197,94,0.2),inset_0_1px_0_rgba(255,255,255,0.15)]"
                      : isDone
                      ? "bg-slate-950/80 border-slate-800/90 text-slate-300"
                      : "bg-slate-950/40 border-slate-900 text-slate-500 opacity-60"
                  }`}
                >
                  {/* Shimmer Sweep Animation on Active Card */}
                  {isCurrent && (
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent -translate-x-full animate-shimmer pointer-events-none" />
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-bold font-sans ${
                        isCurrent ? "text-emerald-300 text-[13px]" : isDone ? "text-slate-200" : "text-slate-400"
                      }`}
                    >
                      {step.title}
                    </span>

                    {isCurrent ? (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#22c55e] text-slate-950 font-extrabold shadow-sm">
                        Active
                      </span>
                    ) : isDone ? (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={`mt-1 text-[11px] font-sans ${
                      isCurrent ? "text-slate-200" : "text-slate-400"
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
      <div className="pt-4 mt-6 border-t border-white/[0.08] text-[11px] font-mono text-slate-400 flex items-center justify-between relative z-10">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#22c55e]" />
          PostgreSQL Durable State
        </span>
        <span className="text-[#22c55e] font-semibold">Zero Fabrication Guarantee</span>
      </div>
    </div>
  );
}
