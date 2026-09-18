"use client";

import { SchedulingDecisionResponse } from "@/lib/types";
import { CarbonBadge } from "@/components/regions/CarbonBadge";
import { SubscoreBreakdown } from "./SubscoreBreakdown";
import { formatEmissions, formatCarbonIntensity } from "@/lib/utils";
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
} from "lucide-react";

interface DecisionExplainerProps {
  decision: SchedulingDecisionResponse | null;
  loading?: boolean;
}

export function DecisionExplainer({ decision, loading = false }: DecisionExplainerProps) {
  if (loading) {
    return (
      <div className="rounded-xl bg-[#0e1424] border border-slate-800/80 p-6 space-y-4">
        <div className="h-8 w-1/3 bg-slate-800 rounded animate-pulse" />
        <div className="h-24 bg-slate-900/60 rounded-lg animate-pulse" />
        <div className="h-48 bg-slate-900/40 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="p-12 text-center rounded-xl bg-[#0e1424] border border-slate-800/80">
        <Cpu className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-300">No Decision Selected</h3>
        <p className="text-sm text-slate-400 mt-1">
          Select a scheduling evaluation from the list or submit a workload to run real-time multi-objective optimization.
        </p>
      </div>
    );
  }

  // Authoritative Single Source of Truth for Selected Region Decision Metrics
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
  const baselineEnergy = decision.baseline_energy_kwh;
  const baselineCo2 = decision.baseline_co2eq_grams;
  const savingsCo2 = decision.estimated_savings_co2eq_grams;

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
          title: "Workload Deferred (Carbon Slack Window)",
        };
      case "REJECT":
        return {
          bg: "bg-rose-500/10",
          border: "border-rose-500/30",
          text: "text-rose-400",
          icon: XCircle,
          title: "Workload Infeasible (Rejected)",
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

  return (
    <div className="rounded-xl bg-[#0e1424] border border-slate-800/80 p-6 space-y-6 shadow-md font-sans">
      {/* Top Header & Action Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono uppercase text-slate-400">
              Evaluation Decision ID: {decision.id.substring(0, 8)}...
            </span>
            <span className="text-xs text-slate-500">&bull;</span>
            <span className="text-xs text-slate-400 font-mono">
              Job: {decision.job_id ? decision.job_id.substring(0, 8) + "..." : "N/A"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-bold border ${actionStyle.bg} ${actionStyle.border} ${actionStyle.text}`}
            >
              <ActionIcon className="w-4 h-4" />
              <span>{actionStyle.title}</span>
            </div>

            {/* Mode Badge */}
            {decisionMode === "CARBON_AWARE" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                <ShieldCheck className="w-3.5 h-3.5" /> Carbon-Aware Mode
              </span>
            ) : decisionMode === "CONVENTIONAL_FALLBACK" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">
                <AlertTriangle className="w-3.5 h-3.5" /> Conventional Fallback
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 font-mono">
                <Hourglass className="w-3.5 h-3.5" /> {decisionMode}
              </span>
            )}

            {selectedRegionCode && (
              <div className="text-sm font-semibold text-slate-200">
                Target Region:{" "}
                <span className="font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {selectedRegionCode}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Authoritative Carbon Provenance & Timestamp */}
        <div className="flex flex-col md:items-end gap-1.5">
          <CarbonBadge
            intensity={carbonIntensity}
            quality={carbonQuality}
            source={carbonSource}
            isEstimated={carbonIsEstimated}
            estimationMethod={carbonMethod}
            showSource
          />
          <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-500" />
            {decision.created_at ? new Date(decision.created_at).toLocaleString() : "Recently"}
          </span>
        </div>
      </div>

      {/* Fallback Warning Notice if Active */}
      {fallbackReason && (
        <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div>
            <div className="font-semibold uppercase tracking-wider font-mono text-[11px] text-amber-400 mb-0.5">
              Zero-Carbon Fallback Renormalization Applied
            </div>
            <p className="leading-relaxed">{fallbackReason}</p>
          </div>
        </div>
      )}

      {/* Structured Deferral Evaluation & Decision Rationale Card */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
              Algorithmic Decision Rationale
            </h4>
          </div>
          {defInfo && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              Forecast Status: {defInfo.forecast_status}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{rationale}</p>

        {defInfo && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 text-xs font-mono border-t border-slate-800/40">
            <div>
              <span className="text-slate-500 block text-[11px]">Forecast Source:</span>
              <span className="text-slate-300 font-semibold">{defInfo.forecast_source}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Deferral Policy:</span>
              <span className={defInfo.deferral_eligible ? "text-emerald-400" : "text-slate-400"}>
                {defInfo.deferral_eligible ? "Eligible (LOW / Flexible)" : "Direct (Urgent SLA)"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Threshold Required:</span>
              <span className="text-slate-300">
                {defInfo.deferral_threshold_pct != null ? `≥ ${Number(defInfo.deferral_threshold_pct).toFixed(1)}% savings` : "15.0% relative"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Forecast Horizon:</span>
              <span className="text-slate-300">
                {defInfo.forecast_checked_until ? new Date(defInfo.forecast_checked_until).toLocaleTimeString() : "Immediate Window"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Counterfactual Conventional Baseline Comparison */}
      {baselineStrategy && (
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-400" /> Counterfactual Baseline Comparison
            </h4>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Baseline: {baselineStrategy}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
              <div className="text-[11px] text-slate-400 font-mono">Baseline Estimated Emissions</div>
              <div className="text-base font-bold font-mono text-slate-200 mt-1">
                {baselineCo2 != null ? formatEmissions(baselineCo2, true, true) : "N/A"}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Estimated under conventional non-carbon scheduler</div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
              <div className="text-[11px] text-slate-400 font-mono">EcoRoute Estimated Emissions</div>
              <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                {decision.estimated_co2eq_grams != null
                  ? formatEmissions(decision.estimated_co2eq_grams, true, true)
                  : sel?.estimated_emissions_co2eq_grams != null
                  ? formatEmissions(sel.estimated_emissions_co2eq_grams, true, true)
                  : "N/A"}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Optimized via real-time grid carbon routing</div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
              <div className="text-[11px] text-slate-400 font-mono">Estimated Emissions Reduction</div>
              <div className="text-base font-bold font-mono text-cyan-400 mt-1">
                {savingsCo2 != null ? formatEmissions(savingsCo2, true, true) : "N/A"}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Derived from decision-time spatial optimization</div>
            </div>
          </div>
        </div>
      )}

      {/* Objective Tradeoff Weights */}
      <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-300">
            Active Multi-Objective Function Weights ($J_r$)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <span className="text-emerald-400">
            w_C: {safeWeights.carbon_weight.toFixed(2)}
          </span>
          <span className="text-blue-400">
            w_T: {safeWeights.time_weight.toFixed(2)}
          </span>
          <span className="text-purple-400">
            w_U: {safeWeights.utilization_weight.toFixed(2)}
          </span>
          <span className="text-cyan-400">
            w_L: {safeWeights.latency_weight.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Visual Subscore Breakdown */}
      <SubscoreBreakdown
        candidates={candidateRankings}
        weights={safeWeights}
      />

      {/* Candidate Rankings Detailed Table */}
      <div className="pt-2 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
            Candidate Region Ranking Matrix
          </h4>
          <span className="text-[11px] text-slate-500 font-mono">
            N(C) = 0.00 represents lowest carbon objective in feasible set (not zero physical emissions)
          </span>
        </div>

        {candidateRankings.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 rounded-lg border border-slate-800/80 bg-slate-900/40">
            No candidate regional evaluations recorded for this decision (e.g. workload deferred or awaiting resources).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800/80">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider border-b border-slate-800/80">
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
                  <th className="px-4 py-3 text-right">Norm (C / T / U / L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {candidateRankings.map((cand: any) => {
                  const isFeasible = cand.is_feasible ?? (cand.rank !== undefined && cand.rank > 0 && !cand.rejection_reason && (cand.composite_score != null || cand.cost_score_jr != null));
                  const compScore = cand.composite_score != null ? Number(cand.composite_score) : (cand.cost_score_jr != null ? Number(cand.cost_score_jr) : null);
                  const rawCI = cand.carbon_intensity_gco2 != null ? Number(cand.carbon_intensity_gco2) : (cand.carbon_intensity != null ? Number(cand.carbon_intensity) : null);
                  const rawEmissions = cand.emissions_co2eq != null ? cand.emissions_co2eq : cand.raw_carbon_gco2;
                  const rawDuration = cand.duration_seconds != null ? Number(cand.duration_seconds) : (cand.estimated_duration != null ? Number(cand.estimated_duration) : null);
                  const rawLatency = cand.raw_latency_ms != null ? Number(cand.raw_latency_ms) : (cand.network_latency_ms != null ? Number(cand.network_latency_ms) : null);
                  const projUtil = cand.projected_utilization != null ? Number(cand.projected_utilization) : (cand.utilization != null ? Number(cand.utilization) : null);

                  const normCarbon = cand.norm_carbon != null ? Number(cand.norm_carbon) : (cand.score_breakdown?.norm_carbon != null ? Number(cand.score_breakdown.norm_carbon) : null);
                  const normDuration = cand.norm_duration != null ? Number(cand.norm_duration) : (cand.score_breakdown?.norm_duration != null ? Number(cand.score_breakdown.norm_duration) : (cand.norm_cost != null ? Number(cand.norm_cost) : null));
                  const normUtil = cand.norm_utilization != null ? Number(cand.norm_utilization) : (cand.score_breakdown?.norm_utilization != null ? Number(cand.score_breakdown.norm_utilization) : null);
                  const normLatency = cand.norm_latency != null ? Number(cand.norm_latency) : (cand.score_breakdown?.norm_latency != null ? Number(cand.score_breakdown.norm_latency) : null);

                  return (
                    <tr
                      key={cand.region_id || cand.region_code}
                      className={`hover:bg-slate-900/40 transition-colors ${
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
                            className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                              cand.rank === 1
                                ? "bg-emerald-500 text-slate-950"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            #{cand.rank}
                          </span>
                        ) : (
                          <span className="text-rose-400 text-xs">Infeasible</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-200">
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
                      <td className="px-4 py-3 text-right font-mono text-slate-400 text-[11px]">
                        {normCarbon != null ? normCarbon.toFixed(2) : "—"} / {normDuration != null ? normDuration.toFixed(2) : "—"} / {normUtil != null ? normUtil.toFixed(2) : "—"} / {normLatency != null ? normLatency.toFixed(2) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Data Provenance & Scope Reference Banner */}
        <div className="p-3.5 rounded-lg bg-slate-900/30 border border-slate-800/60 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400" />
            <span className="text-slate-300 font-semibold">Data Provenance Standards:</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span className="text-teal-400">
              <strong className="text-slate-200">REAL:</strong> Electricity Maps live carbon telemetry
            </span>
            <span className="text-blue-400">
              <strong className="text-slate-200">SIMULATED:</strong> Cluster capacity, power curves & latency
            </span>
            <span className="text-emerald-400">
              <strong className="text-slate-200">ESTIMATED:</strong> Derived energy, emissions & savings
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
