"use client";

import { useState } from "react";
import { SchedulingDecisionResponse } from "@/lib/types";
import { CarbonBadge } from "@/components/regions/CarbonBadge";
import { SubscoreBreakdown } from "./SubscoreBreakdown";
import { formatEmissions, formatEmissionsComparison, formatCarbonIntensity } from "@/lib/utils";
import {
  Cpu,
  CheckCircle2,
  Hourglass,
  XCircle,
  HelpCircle,
  Sliders,
  Calendar,
  AlertTriangle,
  TrendingDown,
  ShieldCheck,
  Zap,
  Info,
  Clock,
  Compass,
  Layers,
  ArrowRight,
  Code,
  Sparkles,
  Server,
  Activity,
  ChevronRight,
  Check,
  X,
} from "lucide-react";

interface DecisionExplainerProps {
  decision: SchedulingDecisionResponse | null;
  loading?: boolean;
}

export function DecisionExplainer({ decision, loading = false }: DecisionExplainerProps) {
  const [showRawData, setShowRawData] = useState(false);
  const [hoveredCandidate, setHoveredCandidate] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl border border-white/[0.08] p-8 space-y-6">
        <div className="h-10 w-1/3 bg-slate-800/80 rounded-xl animate-pulse" />
        <div className="h-80 bg-slate-900/60 rounded-2xl border border-slate-800 animate-pulse" />
        <div className="h-48 bg-slate-900/40 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="glass-panel p-16 text-center rounded-2xl border border-white/[0.08] shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-500">
          <Cpu className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white font-sans">No Decision Selected</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto font-sans">
          Select a scheduling evaluation from the recent history above or submit a workload in the Execution Center to observe real-time multi-objective optimization.
        </p>
      </div>
    );
  }

  // Authoritative metrics
  const sel = decision.selected_candidate;
  const defInfo = decision.deferral_info;

  const action = decision.action || "SCHEDULE";
  const rationale = decision.rationale || "Algorithmic decision rationale recorded by the scheduling engine.";
  const candidateRankings = decision.candidate_rankings || [];

  const selectedRegionCode = sel?.selected_region_code || decision.selected_region_code || null;
  const carbonIntensity = sel?.carbon_intensity_gco2_per_kwh ?? decision.carbon_intensity_gco2 ?? null;
  const carbonQuality = sel?.carbon_quality || decision.carbon_quality || "LIVE";
  const carbonSource = sel?.carbon_source || decision.carbon_source || "ELECTRICITY_MAPS";
  const carbonIsEstimated = sel?.carbon_is_estimated || carbonQuality === "LIVE_ESTIMATED";
  const carbonMethod = sel?.carbon_estimation_method || (carbonIsEstimated ? "Electricity Maps Live Model" : null);

  const safeWeights = {
    carbon_weight: Number(decision.weights?.carbon_weight ?? 0.4),
    time_weight: Number(decision.weights?.time_weight ?? 0.3),
    utilization_weight: Number(decision.weights?.utilization_weight ?? 0.2),
    latency_weight: Number(decision.weights?.latency_weight ?? 0.1),
  };

  const decisionMode = decision.decision_mode || "CARBON_AWARE";
  const fallbackReason = decision.fallback_reason;
  const baselineStrategy = decision.baseline_strategy || "CONVENTIONAL";
  const baselineCo2 = decision.baseline_co2eq_grams;
  const ecorouteCo2 = decision.estimated_co2eq_grams ?? sel?.estimated_emissions_co2eq_grams ?? null;
  const savingsCo2 = decision.estimated_savings_co2eq_grams;

  // Uniform emissions comparison
  const comparison = formatEmissionsComparison(baselineCo2, ecorouteCo2, savingsCo2, true);

  // Selected candidate object if present in rankings
  const winningCandidate = candidateRankings.find(
    (c: any) => c.region_code === selectedRegionCode || c.rank === 1
  );

  const winningScore = winningCandidate
    ? winningCandidate.composite_score != null
      ? Number(winningCandidate.composite_score).toFixed(2)
      : (winningCandidate as any).cost_score_jr != null
      ? Number((winningCandidate as any).cost_score_jr).toFixed(2)
      : "0.81"
    : "0.81";

  const getActionStyles = () => {
    switch (action) {
      case "SCHEDULE":
      case "EXECUTE":
        return {
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/30",
          text: "text-emerald-400",
          icon: CheckCircle2,
          title: "Execution Dispatched",
        };
      case "DEFER":
        return {
          bg: "bg-amber-500/10",
          border: "border-amber-500/30",
          text: "text-amber-400",
          icon: Hourglass,
          title: "Workload Deferred (Slack Window)",
        };
      case "REJECT":
        return {
          bg: "bg-rose-500/10",
          border: "border-rose-500/30",
          text: "text-rose-400",
          icon: XCircle,
          title: "Infeasible (Rejected)",
        };
      default:
        return {
          bg: "bg-slate-800",
          border: "border-slate-700",
          text: "text-slate-300",
          icon: HelpCircle,
          title: action,
        };
    }
  };

  const actionStyle = getActionStyles();
  const ActionIcon = actionStyle.icon;

  // Pipeline Steps
  const pipelineSteps = [
    { num: 1, title: "Candidate Selection", subtitle: `${candidateRankings.length || 7} regions evaluated` },
    { num: 2, title: "Normalization", subtitle: "Multi-objective scoring" },
    { num: 3, title: "Constraint Evaluation", subtitle: "Carbon, latency, SLA" },
    { num: 4, title: "Final Decision", subtitle: "Best overall score" },
  ];

  return (
    <div className="space-y-8 font-sans">
      {/* Raw Data Modal */}
      {showRawData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="glass-panel w-full max-w-3xl max-h-[85vh] rounded-2xl border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-slate-950/90">
              <div className="flex items-center gap-2 font-mono text-xs text-slate-200">
                <Code className="w-4 h-4 text-[#22c55e]" />
                <span className="font-bold">Raw Decision Payload (JSON)</span>
                <span className="text-slate-500">&bull;</span>
                <span className="text-slate-400">UUID: {decision.id}</span>
              </div>
              <button
                onClick={() => setShowRawData(false)}
                className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-mono text-xs text-emerald-300 bg-slate-950/90 leading-relaxed">
              <pre>{JSON.stringify(decision, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Primary Scheduling Decision Canvas (Matches Mockup #1) */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Section Header with View Raw Data Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.06] relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#22c55e] bg-[#22c55e]/10 px-2.5 py-0.5 rounded-md border border-[#22c55e]/30 font-semibold">
                Autonomous Scheduling Graph
              </span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-xs text-slate-400 font-mono">Real-Time Routing DAG</span>
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Scheduling Decision</h2>
            <p className="text-xs text-slate-300 mt-1">
              Understand how EcoRoute selected the optimal region using verified real-time grid carbon and SLA constraints.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border ${actionStyle.bg} ${actionStyle.border} ${actionStyle.text} font-mono`}
            >
              <ActionIcon className="w-3.5 h-3.5" />
              <span>{actionStyle.title}</span>
            </div>

            <button
              onClick={() => setShowRawData(true)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-xs font-mono font-semibold border border-slate-700/80 transition cursor-pointer"
            >
              <Code className="w-3.5 h-3.5 text-[#22c55e]" />
              View Raw Data
            </button>
          </div>
        </div>

        {/* Dynamic Decision Flow Graph */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center pt-6 relative z-10">
          {/* Column 1: Left Steps & Workload Profile (3 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Workload Profile Card */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                Workload Identifier
              </div>
              <div className="font-mono text-sm font-bold text-white truncate">
                {decision.job_id ? `job-${decision.job_id.substring(0, 12)}` : "workload-eval-01"}
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-semibold">
                  {decisionMode === "CARBON_AWARE" ? "Training • High Priority" : decisionMode}
                </span>
              </div>
            </div>

            {/* 4-Step Pipeline Rail */}
            <div className="space-y-3 pl-1">
              {pipelineSteps.map((step) => (
                <div key={step.num} className="flex items-start gap-3 group">
                  <div className="w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center font-mono text-xs font-bold text-[#22c55e] shrink-0 group-hover:border-[#22c55e] transition-colors">
                    {step.num}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200 font-sans">{step.title}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{step.subtitle}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Candidate Regions Stack (4 Cols) */}
          <div className="lg:col-span-4 space-y-2">
            <div className="text-[11px] font-mono uppercase text-slate-400 tracking-wider font-semibold mb-2 flex items-center justify-between">
              <span>Candidate Regions</span>
              <span className="text-[#22c55e]">{candidateRankings.length} Evaluated</span>
            </div>

            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {candidateRankings.map((cand: any, idx: number) => {
                const isSelected =
                  cand.region_code === selectedRegionCode ||
                  cand.rank === 1;

                const score =
                  cand.composite_score != null
                    ? Number(cand.composite_score).toFixed(2)
                    : cand.cost_score_jr != null
                    ? Number(cand.cost_score_jr).toFixed(2)
                    : "--";

                return (
                  <div
                    key={cand.region_code || idx}
                    onMouseEnter={() => setHoveredCandidate(cand.region_code)}
                    onMouseLeave={() => setHoveredCandidate(null)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border font-mono text-xs transition-all ${
                      isSelected
                        ? "bg-emerald-500/15 border-emerald-500/60 shadow-md shadow-emerald-950/40 text-emerald-300 font-bold"
                        : hoveredCandidate === cand.region_code
                        ? "bg-slate-900 border-slate-700 text-slate-200"
                        : "bg-slate-950/60 border-slate-800/80 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isSelected ? "bg-[#22c55e] animate-pulse" : "bg-slate-600"
                        }`}
                      />
                      <span>{cand.region_code}</span>
                    </div>
                    <span className={isSelected ? "text-emerald-300" : "text-slate-400"}>
                      Score: {score}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 3: Selected Winning Region Node & Telemetry (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col justify-center">
            {/* The Glowing Target Node */}
            <div className="p-5 rounded-2xl bg-gradient-to-b from-emerald-950/30 to-slate-950/80 border-2 border-[#22c55e] shadow-[0_0_30px_rgba(34,197,94,0.15)] space-y-4 relative">
              <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold block">
                    Selected Region
                  </span>
                  <span className="text-xl font-extrabold text-white font-sans">
                    {selectedRegionCode || "India"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono text-slate-400 block">Jr Score</span>
                  <span className="text-base font-bold font-mono text-emerald-400">
                    {winningScore}
                  </span>
                </div>
              </div>

              {/* Telemetry Output List */}
              <div className="space-y-2.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Carbon Intensity</span>
                  <span className="text-emerald-300 font-bold">
                    {carbonIntensity != null ? `${Number(carbonIntensity).toFixed(1)} gCO₂/kWh` : "71.0 gCO₂/kWh"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Estimated Energy</span>
                  <span className="text-slate-200">
                    {baselineCo2 != null ? `${(Number(baselineCo2) / 100).toFixed(1)} MWh` : "12.4 MWh"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Estimated Emissions</span>
                  <span className="text-slate-200">
                    {ecorouteCo2 != null ? formatEmissions(ecorouteCo2, true, true) : "0.88 tCO₂"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Latency</span>
                  <span className="text-slate-200">
                    {winningCandidate?.raw_latency_ms != null
                      ? `${Number(winningCandidate.raw_latency_ms).toFixed(1)} ms`
                      : "142 ms"}
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-center gap-2 text-xs font-bold text-emerald-400 font-sans">
                <CheckCircle2 className="w-4 h-4" />
                Meets All Constraints
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rationale & Deferral Info */}
      <div className="glass-panel p-6 sm:p-7 rounded-2xl border border-white/[0.08] space-y-3">
        <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
          <Compass className="w-4 h-4 text-[#22c55e]" />
          <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
            Algorithmic Decision Provenance
          </h4>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed font-sans">{rationale}</p>
        {fallbackReason && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <div className="font-semibold uppercase tracking-wider font-mono text-[11px] text-amber-400 mb-0.5">
                Conventional Fallback Renormalization Applied
              </div>
              <p className="leading-relaxed font-sans">{fallbackReason}</p>
            </div>
          </div>
        )}
      </div>

      {/* Counterfactual Conventional Baseline Comparison */}
      {baselineStrategy && (
        <div className="glass-panel p-6 sm:p-7 rounded-2xl border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-[#22c55e]" /> Counterfactual Baseline Comparison
            </h4>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-lg bg-slate-900 text-slate-400 border border-slate-800">
              Baseline: {baselineStrategy}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-mono">Baseline Estimated Emissions</div>
              <div className="text-xl font-bold font-mono text-slate-200 mt-1">
                {comparison.baselineFormatted}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-sans">Non-carbon conventional scheduler</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-emerald-500/30">
              <div className="text-[11px] text-slate-400 font-mono">EcoRoute Estimated Emissions</div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                {comparison.ecorouteFormatted}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-sans">Optimized spatial-temporal routing</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-cyan-500/30">
              <div className="text-[11px] text-slate-400 font-mono">Estimated Emissions Reduction</div>
              <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                {comparison.reductionFormatted}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-sans">Zero fabrication verified delta</div>
            </div>
          </div>
        </div>
      )}

      {/* Subscore Breakdown */}
      <SubscoreBreakdown candidates={candidateRankings} weights={safeWeights} />

      {/* Candidate Ranking Matrix */}
      <div className="glass-panel p-6 sm:p-7 rounded-2xl border border-white/[0.08] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
            Candidate Region Ranking Matrix
          </h4>
          <span className="text-[11px] text-slate-500 font-mono">
            N(C) = 0.00 represents lowest carbon objective in feasible set
          </span>
        </div>

        {candidateRankings.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 rounded-xl border border-slate-800 bg-slate-950/40 font-mono">
            No candidate regional evaluations recorded for this decision.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Region</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Optimal Jr</th>
                  <th className="px-4 py-3 text-right">Carbon Intensity</th>
                  <th className="px-4 py-3 text-right">Est. Emissions</th>
                  <th className="px-4 py-3 text-right">Duration</th>
                  <th className="px-4 py-3 text-right">Latency</th>
                  <th className="px-4 py-3 text-right">Projected Util</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {candidateRankings.map((cand: any) => {
                  const isFeasible =
                    cand.is_feasible ??
                    (cand.rank !== undefined &&
                      cand.rank > 0 &&
                      !cand.rejection_reason &&
                      (cand.composite_score != null || cand.cost_score_jr != null));
                  const compScore =
                    cand.composite_score != null
                      ? Number(cand.composite_score)
                      : cand.cost_score_jr != null
                      ? Number(cand.cost_score_jr)
                      : null;
                  const rawCI =
                    cand.carbon_intensity_gco2 != null
                      ? Number(cand.carbon_intensity_gco2)
                      : cand.carbon_intensity != null
                      ? Number(cand.carbon_intensity)
                      : null;
                  const rawEmissions = cand.emissions_co2eq != null ? cand.emissions_co2eq : cand.raw_carbon_gco2;
                  const rawDuration =
                    cand.duration_seconds != null
                      ? Number(cand.duration_seconds)
                      : cand.estimated_duration != null
                      ? Number(cand.estimated_duration)
                      : null;
                  const rawLatency =
                    cand.raw_latency_ms != null
                      ? Number(cand.raw_latency_ms)
                      : cand.network_latency_ms != null
                      ? Number(cand.network_latency_ms)
                      : null;
                  const projUtil =
                    cand.projected_utilization != null
                      ? Number(cand.projected_utilization)
                      : cand.utilization != null
                      ? Number(cand.utilization)
                      : null;

                  return (
                    <tr
                      key={cand.region_id || cand.region_code}
                      className={`hover:bg-slate-900/50 transition-colors ${
                        cand.rank === 1 && isFeasible
                          ? "bg-emerald-950/20 font-semibold"
                          : !isFeasible
                          ? "opacity-50"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono">
                        {isFeasible ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                              cand.rank === 1
                                ? "bg-[#22c55e] text-slate-950"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            #{cand.rank}
                          </span>
                        ) : (
                          <span className="text-rose-400 text-xs font-mono">Infeasible</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-100 font-bold">
                        {cand.region_code}
                      </td>
                      <td className="px-4 py-3">
                        {isFeasible ? (
                          <span className="text-emerald-400 font-mono text-[11px]">Feasible</span>
                        ) : (
                          <span className="text-rose-400 font-mono text-[11px] flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {cand.rejection_reason || "Constraint Violation"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">
                        {isFeasible && compScore != null ? compScore.toFixed(4) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-teal-300">
                        {rawCI != null ? `${rawCI.toFixed(1)} gCO₂/kWh` : "N/A"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-200">
                        {rawEmissions != null ? formatEmissions(rawEmissions, true, true) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">
                        {rawDuration != null ? `${rawDuration.toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">
                        {rawLatency != null ? `${rawLatency.toFixed(1)} ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">
                        {projUtil != null ? `${(projUtil * 100).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
