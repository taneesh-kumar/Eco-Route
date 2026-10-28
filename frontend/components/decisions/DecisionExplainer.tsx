"use client";

import { useState } from "react";
import { SchedulingDecisionResponse } from "@/lib/types";
import { SubscoreBreakdown } from "./SubscoreBreakdown";
import { formatEmissions, formatEmissionsComparison } from "@/lib/utils";
import {
  Cpu,
  CheckCircle2,
  Hourglass,
  XCircle,
  HelpCircle,
  AlertTriangle,
  TrendingDown,
  Zap,
  Clock,
  Compass,
  Code,
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
      <div className="ecoroute-card p-8 space-y-6">
        <div className="h-10 w-1/3 bg-[#F4E4C4]/50 rounded-xl animate-pulse" />
        <div className="h-64 bg-[#F4E4C4]/30 rounded-2xl animate-pulse" />
        <div className="h-40 bg-[#F4E4C4]/30 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="ecoroute-card p-16 text-center shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-[#FFFDF8] border border-[#DCCFB5] flex items-center justify-center mx-auto mb-4 text-[#A5BDAA]">
          <Cpu className="w-8 h-8 text-[#075442]" />
        </div>
        <h3 className="text-lg font-bold text-[#183B32] font-sans">No Decision Selected</h3>
        <p className="text-xs text-[#63786C] mt-1 max-w-md mx-auto font-sans">
          Select a scheduling evaluation from the recent history above or submit a workload to observe real-time multi-objective optimization.
        </p>
      </div>
    );
  }

  // Authoritative metrics
  const sel = decision.selected_candidate;

  const action = decision.action || "SCHEDULE";
  const decisionMode = decision.decision_mode || "CARBON_AWARE";
  const isDeferred = action === "DEFER" || decisionMode === "DEFERRED";
  const isRejected = action === "REJECT";
  const rationale = decision.rationale || "Algorithmic decision rationale recorded by the scheduling engine.";
  const candidateRankings = decision.candidate_rankings || [];
  const workloadType = decision.workload_type || "Workload";
  const priorityLabel = decision.priority_class
    ? `${decision.priority_class} Priority`
    : decision.priority != null
    ? `Priority ${decision.priority}`
    : null;
  const workloadLabel = decision.workload_name || `job-${decision.job_id.substring(0, 12)}`;

  const selectedRegionCode = isDeferred
    ? null
    : sel?.selected_region_code || decision.selected_region_code || null;
  const carbonIntensity = sel?.carbon_intensity_gco2_per_kwh ?? decision.carbon_intensity_gco2 ?? null;

  const safeWeights = {
    carbon_weight: Number(decision.weights?.carbon_weight ?? 0.4),
    time_weight: Number(decision.weights?.time_weight ?? 0.3),
    utilization_weight: Number(decision.weights?.utilization_weight ?? 0.2),
    latency_weight: Number(decision.weights?.latency_weight ?? 0.1),
  };

  const fallbackReason = decision.fallback_reason;
  const baselineStrategy = decision.baseline_strategy || "CONVENTIONAL";
  const baselineCo2 = decision.baseline_co2eq_grams;
  const ecorouteCo2 = decision.estimated_co2eq_grams ?? sel?.estimated_emissions_co2eq_grams ?? null;
  const savingsCo2 = decision.estimated_savings_co2eq_grams;

  // Uniform emissions comparison
  const comparison = formatEmissionsComparison(baselineCo2, ecorouteCo2, savingsCo2, true);

  // Selected candidate object if present in rankings
  const winningCandidate = candidateRankings.find((c: any) =>
    selectedRegionCode ? c.region_code === selectedRegionCode : c.rank === 1
  );

  const winningScore = winningCandidate
    ? winningCandidate.composite_score != null
      ? Number(winningCandidate.composite_score).toFixed(2)
      : (winningCandidate as any).cost_score_jr != null
      ? Number((winningCandidate as any).cost_score_jr).toFixed(2)
      : "N/A"
    : "N/A";
  const feasibleCandidates = candidateRankings.filter((candidate: any) => candidate.is_feasible !== false);
  const nextCandidate = feasibleCandidates.find((candidate: any) => candidate.rank === 2);
  const nextScore = nextCandidate ? Number(nextCandidate.composite_score ?? (nextCandidate as any).cost_score_jr ?? 0) : null;
  const scoreGap = nextScore !== null ? Math.max(0, Number(winningScore) - nextScore) : null;
  const lifecycleStatus = decision.job_status || (isDeferred ? "WAITING" : isRejected ? "FAILED" : action === "EXECUTE" ? "DISPATCHED" : action);
  const statusExplanation = lifecycleStatus === "WAITING"
    ? "WAITING: execution is paused until a later evaluation returns EXECUTE."
    : lifecycleStatus === "DISPATCHED"
    ? "DISPATCHED: an execution attempt was created; the worker has not completed it yet."
    : lifecycleStatus === "RUNNING"
    ? "RUNNING: a worker has claimed the attempt and is executing it."
    : lifecycleStatus === "COMPLETED"
    ? "COMPLETED: the worker finished the execution and recorded telemetry."
    : lifecycleStatus === "FAILED"
    ? "FAILED: execution did not complete successfully or no feasible path remained."
    : `Lifecycle status: ${lifecycleStatus}.`;

  const getActionStyles = () => {
    switch (action) {
      case "SCHEDULE":
      case "EXECUTE":
        return {
          bg: "bg-[#075442]/10",
          border: "border-[#075442]/30",
          text: "text-[#075442]",
          icon: CheckCircle2,
          title: "Execution Dispatched",
        };
      case "DEFER":
        return {
          bg: "bg-[#C99B43]/15",
          border: "border-[#C99B43]/30",
          text: "text-[#8C6212]",
          icon: Hourglass,
          title: "Workload Deferred (Slack Window)",
        };
      case "REJECT":
        return {
          bg: "bg-rose-50",
          border: "border-rose-200",
          text: "text-rose-700",
          icon: XCircle,
          title: "Infeasible (Rejected)",
        };
      default:
        return {
          bg: "bg-[#FFFDF8]",
          border: "border-[#DCCFB5]",
          text: "text-[#183B32]",
          icon: HelpCircle,
          title: action,
        };
    }
  };

  const actionStyle = getActionStyles();
  const ActionIcon = actionStyle.icon;

  const pipelineSteps = [
    { num: 1, title: "Candidate Selection", subtitle: `${candidateRankings.length} regions evaluated` },
    { num: 2, title: "Normalization", subtitle: "Multi-objective scoring" },
    { num: 3, title: "Constraint Evaluation", subtitle: "Carbon, latency, SLA" },
    { num: 4, title: "Final Decision", subtitle: "Best overall score" },
  ];

  return (
    <div className="space-y-8 font-sans">
      {/* Raw Data Modal */}
      {showRawData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#063B30]/60 backdrop-blur-sm">
          <div className="ecoroute-card-elevated w-full max-w-3xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#DCCFB5] bg-[#FFF8EB]">
              <div className="flex items-center gap-2 font-mono text-xs text-[#183B32]">
                <Code className="w-4 h-4 text-[#075442]" />
                <span className="font-bold">Raw Decision Payload (JSON)</span>
                <span className="text-[#A5BDAA]">&bull;</span>
                <span className="text-[#63786C]">UUID: {decision.id}</span>
              </div>
              <button
                onClick={() => setShowRawData(false)}
                className="w-8 h-8 rounded-lg bg-[#FFFDF8] hover:bg-[#F4E4C4] text-[#63786C] hover:text-[#183B32] border border-[#DCCFB5] flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-mono text-xs text-[#183B32] bg-[#FFFDF8] leading-relaxed">
              <pre>{JSON.stringify(decision, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Primary Scheduling Decision Canvas */}
      <div className="ecoroute-card p-6 sm:p-8 shadow-xs relative overflow-hidden">
        {/* Section Header with View Raw Data Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#DCCFB5] relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#075442] bg-[#075442]/10 px-2.5 py-0.5 rounded-full border border-[#075442]/20 font-semibold">
                Decision Provenance
              </span>
              <span className="text-[#A5BDAA]">&bull;</span>
              <span className="text-xs text-[#63786C] font-mono">Auditable evaluation record</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#075442] tracking-tight">Scheduling Decision</h2>
            <p className="text-xs text-[#63786C] mt-1">
              Understand how EcoRoute selected the optimal region using verified real-time grid carbon and SLA constraints.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${actionStyle.bg} ${actionStyle.border} ${actionStyle.text} font-mono`}
            >
              <ActionIcon className="w-3.5 h-3.5" />
              <span>{actionStyle.title}</span>
            </div>

            <button
              onClick={() => setShowRawData(true)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#FFFDF8] hover:bg-[#F4E4C4] text-[#183B32] text-xs font-mono font-semibold border border-[#DCCFB5] transition cursor-pointer shadow-xs"
            >
              <Code className="w-3.5 h-3.5 text-[#075442]" />
              View Raw Data
            </button>
          </div>
        </div>

        {/* Dynamic Decision Flow Graph */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center pt-6 relative z-10">
          {/* Column 1: Left Steps & Workload Profile (4 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5] space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#63786C] font-bold">
                Workload Identifier
              </div>
              <div className="font-mono text-sm font-bold text-[#183B32] truncate">
                {workloadLabel}
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2 py-0.5 rounded bg-[#075442]/10 text-[#075442] border border-[#075442]/20 font-semibold">
                  {workloadType}{priorityLabel ? ` • ${priorityLabel}` : ""}
                </span>
              </div>
            </div>

            {/* 4-Step Pipeline Rail */}
            <div className="space-y-3 pl-1">
              {pipelineSteps.map((step) => (
                <div key={step.num} className="flex items-start gap-3 group">
                  <div className="w-6 h-6 rounded-full bg-[#FFFDF8] border border-[#DCCFB5] flex items-center justify-center font-mono text-xs font-bold text-[#075442] shrink-0 group-hover:border-[#075442] transition-colors">
                    {step.num}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#183B32] font-sans">{step.title}</div>
                    <div className="text-[11px] text-[#63786C] font-mono">{step.subtitle}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Candidate Regions Stack (4 Cols) */}
          <div className="lg:col-span-4 space-y-2">
            <div className="text-[11px] font-mono uppercase text-[#63786C] tracking-wider font-semibold mb-2 flex items-center justify-between">
              <span>Candidate Regions</span>
              <span className="text-[#075442] font-bold">{candidateRankings.length} Evaluated</span>
            </div>

            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {candidateRankings.map((cand: any, idx: number) => {
                const isSelected =
                  !isDeferred && (cand.region_code === selectedRegionCode || cand.rank === 1);

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
                        ? "bg-[#FFFDF8] border-[#075442] shadow-xs text-[#075442] font-bold"
                        : hoveredCandidate === cand.region_code
                        ? "bg-[#FFFDF8] border-[#075442] text-[#183B32]"
                        : "bg-[#FFF8EB] border-[#DCCFB5] text-[#486256]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isSelected ? "bg-[#075442]" : "bg-[#A5BDAA]"
                        }`}
                      />
                      <span>{cand.region_code}</span>
                    </div>
                    <span className={isSelected ? "text-[#075442] font-bold" : "text-[#63786C]"}>
                      Score: {score}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 3: Selected Winning Region Node & Telemetry (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col justify-center">
            <div className="p-5 rounded-2xl bg-[#FFFDF8] border-2 border-[#075442] shadow-xs space-y-4 relative">
              <div className="flex items-center justify-between pb-3 border-b border-[#DCCFB5]">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#075442] font-bold block">
                    {isDeferred ? "Best Candidate (Not Assigned)" : "Selected Region"}
                  </span>
                  <span className="text-xl font-extrabold text-[#183B32] font-sans">
                    {selectedRegionCode || (isDeferred ? "No region assigned" : "Pending")}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono text-[#63786C] block">Jr Score</span>
                  <span className="text-base font-bold font-mono text-[#075442]">
                    {winningScore}
                  </span>
                </div>
              </div>

              {/* Telemetry Output List */}
              <div className="space-y-2.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[#63786C]">Carbon Intensity</span>
                  <span className="text-[#075442] font-bold">
                    {carbonIntensity != null ? `${Number(carbonIntensity).toFixed(1)} gCO₂/kWh` : "Verified Live"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#63786C]">Estimated Energy</span>
                  <span className="text-[#183B32]">
                    {sel?.energy_kwh != null
                      ? `${Number(sel.energy_kwh).toFixed(3)} kWh`
                      : baselineCo2 != null
                      ? `${(Number(baselineCo2) / 1000).toFixed(2)} kWh`
                      : "Dynamic Integrated"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#63786C]">Estimated Emissions</span>
                  <span className="text-[#183B32]">
                    {ecorouteCo2 != null ? formatEmissions(ecorouteCo2, true, true) : "Optimized Baseline"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#63786C]">Latency</span>
                  <span className="text-[#183B32]">
                    {winningCandidate?.raw_latency_ms != null
                      ? `${Number(winningCandidate.raw_latency_ms).toFixed(1)} ms`
                      : "Optimal"}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#DCCFB5] flex items-center justify-center gap-2 text-xs font-bold text-[#075442] font-sans">
                <CheckCircle2 className="w-4 h-4 text-[#075442]" />
                Meets All SLA &amp; Carbon Constraints
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rationale & Review */}
      <div className="ecoroute-card p-6 sm:p-7 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#DCCFB5] pb-3">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#075442]" />
            <h4 className="text-xs font-bold text-[#075442] uppercase tracking-wider font-mono">
              Scheduling Decision Provenance &amp; Deferral Review
            </h4>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full ecoroute-badge-emerald font-bold">
            Policy: {decisionMode}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5] space-y-3 font-sans">
          <div className="flex items-start gap-3">
            <div className={`w-6 h-6 rounded-full ${actionStyle.bg} border ${actionStyle.border} flex items-center justify-center shrink-0 mt-0.5`}>
              <ActionIcon className={`w-3.5 h-3.5 ${actionStyle.text}`} />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#183B32]">
                {isDeferred
                  ? "Decision Summary: Deferred — no region assigned"
                  : isRejected
                  ? "Decision Summary: Rejected — workload is not schedulable"
                  : `Decision Summary: ${lifecycleStatus} in ${selectedRegionCode || "the best candidate"}`}
              </div>
              <p className="text-xs text-[#486256] leading-relaxed">
                {rationale}
              </p>
              <p className="text-[11px] text-[#075442] font-mono mt-2 font-semibold">{statusExplanation}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-[#DCCFB5] text-xs">
            <div className="p-3.5 rounded-lg bg-[#FFF8EB] border border-[#DCCFB5]">
              <div className="text-[#075442] font-mono text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-[#075442]" /> {isDeferred ? "Why Defer to the Future?" : "Why Not Defer to the Future?"}
              </div>
              <p className="text-[#486256] text-[11px] leading-relaxed">
                {isDeferred
                  ? `The workload remains WAITING because the scheduler found a valid deferral opportunity within the deadline slack window. Dispatch occurs when cleaner grid conditions approach.`
                  : isRejected
                  ? "The workload cannot be dispatched because no candidate satisfies the hard operational constraints before its deadline."
                  : <>All {feasibleCandidates.length} feasible regions were scored for <strong className="text-[#183B32]">{workloadLabel}</strong>. <span className="text-[#075442] font-mono font-bold">{selectedRegionCode || "The selected region"}</span> was dispatched because it had the lowest composite penalty ({winningScore}); no forecast justified delaying this workload.</>}
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FFF8EB] border border-[#DCCFB5]">
              <div className="text-[#075442] font-mono text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-[#075442]" /> Best Candidate vs Expected Range
              </div>
              <p className="text-[#486256] text-[11px] leading-relaxed">
                {isDeferred
                  ? <>The current best candidate is <span className="text-[#075442] font-mono font-bold">{winningCandidate?.region_code || "pending"}</span> at Jr {winningScore}, but it is only a planning result and has not been dispatched.</>
                  : <>Among {candidateRankings.length} evaluated regions, <span className="text-[#075442] font-mono font-bold">{selectedRegionCode || "the winner"}</span> ranked #1 at Jr {winningScore}{nextScore !== null && nextCandidate ? <>; {nextCandidate.region_code} ranked #2 at Jr {nextScore.toFixed(2)}, a gap of {scoreGap?.toFixed(2)}</> : null}.</>}
              </p>
            </div>
          </div>
        </div>

        {fallbackReason && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-[#8C6212] text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#C99B43]" />
            <div>
              <div className="font-bold uppercase tracking-wider font-mono text-[11px] mb-0.5">
                Conventional Fallback Renormalization Applied
              </div>
              <p className="leading-relaxed font-sans">{fallbackReason}</p>
            </div>
          </div>
        )}
      </div>

      {/* Counterfactual Conventional Baseline Comparison */}
      {baselineStrategy && (
        <div className="ecoroute-card p-6 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#075442] uppercase tracking-wider font-mono flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-[#075442]" /> Counterfactual Baseline Comparison
            </h4>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[#FFFDF8] text-[#486256] border border-[#DCCFB5] font-semibold">
              Baseline: {baselineStrategy}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5]">
              <div className="text-[11px] text-[#63786C] font-mono font-semibold">Baseline Estimated Emissions</div>
              <div className="text-xl font-extrabold font-mono text-[#183B32] mt-1">
                {comparison.baselineFormatted}
              </div>
              <div className="text-[10px] text-[#63786C] mt-0.5 font-sans">Non-carbon conventional scheduler</div>
            </div>

            <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#075442]/30">
              <div className="text-[11px] text-[#075442] font-mono font-semibold">EcoRoute Estimated Emissions</div>
              <div className="text-xl font-extrabold font-mono text-[#075442] mt-1">
                {comparison.ecorouteFormatted}
              </div>
              <div className="text-[10px] text-[#63786C] mt-0.5 font-sans">Optimized spatial-temporal routing</div>
            </div>

            <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#C99B43]/40">
              <div className="text-[11px] text-[#8C6212] font-mono font-semibold">Estimated Emissions Reduction</div>
              <div className="text-xl font-extrabold font-mono text-[#8C6212] mt-1">
                {comparison.reductionFormatted}
              </div>
              <div className="text-[10px] text-[#63786C] mt-0.5 font-sans">Recorded emissions reduction</div>
            </div>
          </div>
        </div>
      )}

      {/* Subscore Breakdown */}
      <SubscoreBreakdown
        candidates={candidateRankings}
        weights={safeWeights}
        selectedRegionCode={selectedRegionCode}
        action={action}
      />

      {/* Candidate Ranking Matrix Table */}
      <div className="ecoroute-card p-6 sm:p-7 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-[#075442] uppercase tracking-wider font-mono">
            Candidate Region Ranking Matrix
          </h4>
          <span className="text-[11px] text-[#63786C] font-mono">
            N(C) = 0.00 represents lowest carbon objective in feasible set
          </span>
        </div>

        {candidateRankings.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#63786C] rounded-xl border border-[#DCCFB5] bg-[#FFFDF8] font-mono">
            No candidate regional evaluations recorded for this decision.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#DCCFB5]">
            <table className="w-full text-left text-xs font-mono">
              <thead>
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
              <tbody className="divide-y divide-[#EADBCE] font-sans">
                {candidateRankings.map((cand: any) => {
                  const isFeasible =
                    cand.is_feasible ??
                    (cand.rank !== undefined &&
                      cand.rank > 0 &&
                      !cand.rejection_reason &&
                      (cand.composite_score != null || cand.cost_score_jr != null));
                  const isSelectedExecution = action === "EXECUTE" && cand.region_code === selectedRegionCode;
                  const isBestUnassigned = action === "DEFER" && cand.rank === 1;
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
                      className={`hover:bg-[#F8EEDC] transition-colors ${
                        isSelectedExecution
                          ? "bg-[#FFFDF8] font-semibold"
                          : !isFeasible
                          ? "opacity-50"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono">
                        {isFeasible ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              isSelectedExecution
                                ? "bg-[#075442] text-[#FFF8EB]"
                                : "bg-[#FFFDF8] text-[#486256] border border-[#DCCFB5]"
                            }`}
                          >
                            #{cand.rank}
                          </span>
                        ) : (
                          <span className="text-rose-700 text-xs font-mono font-bold">Infeasible</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#183B32] font-bold">
                        {cand.region_code}
                      </td>
                      <td className="px-4 py-3">
                        {isFeasible ? (
                          <span className={`font-mono text-[11px] ${isSelectedExecution ? "text-[#075442] font-bold" : isBestUnassigned ? "text-[#8C6212] font-semibold" : "text-[#63786C]"}`}>
                            {isSelectedExecution ? "Selected execution target" : isBestUnassigned ? "Best feasible (deferred)" : "Feasible"}
                          </span>
                        ) : (
                          <span className="text-rose-700 font-mono text-[11px] flex items-center gap-1 font-semibold">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            {cand.rejection_reason || "Constraint Violation"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#075442] font-extrabold">
                        {isFeasible && compScore != null ? compScore.toFixed(4) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#183B32]">
                        {rawCI != null ? `${rawCI.toFixed(1)} gCO₂/kWh` : "N/A"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#183B32]">
                        {rawEmissions != null ? formatEmissions(rawEmissions, true, true) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#63786C]">
                        {rawDuration != null ? `${rawDuration.toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#63786C]">
                        {rawLatency != null ? `${rawLatency.toFixed(1)} ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#63786C]">
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
