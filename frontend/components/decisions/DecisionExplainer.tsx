"use client";

import { SchedulingDecisionResponse } from "@/lib/types";
import { CarbonBadge } from "@/components/regions/CarbonBadge";
import { SubscoreBreakdown } from "./SubscoreBreakdown";
import {
  Cpu,
  CheckCircle2,
  Hourglass,
  XCircle,
  HelpCircle,
  Sliders,
  Calendar,
  AlertTriangle,
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
          Select a scheduling evaluation from the list or trigger scheduling on a pending workload.
        </p>
      </div>
    );
  }

  const dAny = decision as any;
  const action = decision.action || dAny.decision_action || "SCHEDULE";
  const rationale = decision.rationale || dAny.decision_reason || "Algorithmic decision rationale recorded by the scheduling engine.";
  const candidateRankings = decision.candidate_rankings || [];
  const safeWeights = decision.weights || {
    carbon_weight: Number(dAny.applied_weights?.carbon ?? 0.6),
    cost_weight: Number(dAny.applied_weights?.cost ?? dAny.applied_weights?.time ?? 0.3),
    latency_weight: Number(dAny.applied_weights?.latency ?? 0.1),
  };
  const selectedRegionCode = decision.selected_region_code || dAny.selected_region_code || (candidateRankings.find((c: any) => c.region_id === decision.selected_region_id)?.region_code);

  const getActionStyles = () => {
    switch (action) {
      case "SCHEDULE":
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
    <div className="rounded-xl bg-[#0e1424] border border-slate-800/80 p-6 space-y-6 shadow-md">
      {/* Top Header & Action Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono uppercase text-slate-400">
              Evaluation Decision ID: {decision.id.substring(0, 8)}...
            </span>
            <span className="text-xs text-slate-400">&bull;</span>
            <span className="text-xs text-slate-400 font-mono">
              Job: {decision.job_id ? decision.job_id.substring(0, 8) + "..." : "N/A"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-bold border ${actionStyle.bg} ${actionStyle.border} ${actionStyle.text}`}
            >
              <ActionIcon className="w-4 h-4" />
              <span>{actionStyle.title}</span>
            </div>

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

        {/* Carbon Provenance & Timestamp */}
        <div className="flex flex-col md:items-end gap-1.5">
          <CarbonBadge
            intensity={decision.carbon_intensity_gco2}
            quality={decision.carbon_quality || dAny.carbon_quality_used}
            source={decision.carbon_source || dAny.carbon_source_used}
            showSource
          />
          <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-400" />
            {decision.created_at ? new Date(decision.created_at).toLocaleString() : "Recently"}
          </span>
        </div>
      </div>

      {/* Algorithmic Rationale */}
      <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-1.5">
          Algorithmic Decision Rationale
        </h4>
        <p className="text-sm text-slate-200 leading-relaxed font-sans">
          {rationale}
        </p>
      </div>

      {/* Objective Tradeoff Weights */}
      <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-300">
            Active Multi-Objective Function Weights
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-emerald-400">
            w_carbon: {safeWeights.carbon_weight.toFixed(2)}
          </span>
          <span className="text-amber-400">
            w_cost: {safeWeights.cost_weight.toFixed(2)}
          </span>
          <span className="text-cyan-400">
            w_latency: {safeWeights.latency_weight.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Visual Subscore Breakdown */}
      <SubscoreBreakdown
        candidates={candidateRankings}
        weights={safeWeights}
      />

      {/* Candidate Rankings Detailed Table */}
      <div className="pt-2">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-3">
          Candidate Region Ranking Matrix
        </h4>
        {candidateRankings.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 rounded-lg border border-slate-800/80 bg-slate-900/40">
            No candidate regional evaluations recorded for this decision (e.g. workload deferral prior to dispatch).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800/80">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider border-b border-slate-800/80">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Region</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Composite (C)</th>
                  <th className="px-4 py-3 text-right">Raw Carbon</th>
                  <th className="px-4 py-3 text-right">Raw Cost</th>
                  <th className="px-4 py-3 text-right">Raw Latency</th>
                  <th className="px-4 py-3 text-right">Norm (C / $ / L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {candidateRankings.map((cand: any) => {
                  const isFeasible = cand.is_feasible ?? (cand.rank !== undefined && cand.rank > 0 && !cand.rejection_reason && (cand.composite_score != null || cand.cost_score_jr != null));
                  const compScore = cand.composite_score != null ? Number(cand.composite_score) : (cand.cost_score_jr != null ? Number(cand.cost_score_jr) : null);
                  const rawCarbon = cand.raw_carbon_gco2 != null ? Number(cand.raw_carbon_gco2) : (cand.emissions_co2eq != null ? Number(cand.emissions_co2eq) : null);
                  const rawCost = cand.raw_cost_usd != null ? Number(cand.raw_cost_usd) : (cand.energy_kwh != null ? Number(cand.energy_kwh) * 0.12 : null);
                  const rawLatency = cand.raw_latency_ms != null ? Number(cand.raw_latency_ms) : (cand.network_latency_ms != null ? Number(cand.network_latency_ms) : null);
                  const normCarbon = cand.norm_carbon != null ? Number(cand.norm_carbon) : (cand.score_breakdown?.norm_carbon != null ? Number(cand.score_breakdown.norm_carbon) : null);
                  const normCost = cand.norm_cost != null ? Number(cand.norm_cost) : (cand.score_breakdown?.norm_duration != null ? Number(cand.score_breakdown.norm_duration) : null);
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
                      <td className="px-4 py-3 text-right font-mono text-slate-300">
                        {rawCarbon != null ? `${rawCarbon.toFixed(1)} gCO₂` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">
                        {rawCost != null ? `$${rawCost.toFixed(4)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">
                        {rawLatency != null ? `${rawLatency.toFixed(1)} ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400 text-[11px]">
                        {normCarbon != null ? normCarbon.toFixed(2) : "—"} / {normCost != null ? normCost.toFixed(2) : "—"} / {normLatency != null ? normLatency.toFixed(2) : "—"}
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
