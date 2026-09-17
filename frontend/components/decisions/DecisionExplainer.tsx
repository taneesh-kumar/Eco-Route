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

  const getActionStyles = () => {
    switch (decision.action) {
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
          title: decision.action,
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
              Job: {decision.job_id.substring(0, 8)}...
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-bold border ${actionStyle.bg} ${actionStyle.border} ${actionStyle.text}`}
            >
              <ActionIcon className="w-4 h-4" />
              <span>{actionStyle.title}</span>
            </div>

            {decision.selected_region_code && (
              <div className="text-sm font-semibold text-slate-200">
                Target Region:{" "}
                <span className="font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {decision.selected_region_code}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Carbon Provenance & Timestamp */}
        <div className="flex flex-col md:items-end gap-1.5">
          <CarbonBadge
            intensity={decision.carbon_intensity_gco2}
            quality={decision.carbon_quality}
            source={decision.carbon_source}
            showSource
          />
          <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-400" />
            {new Date(decision.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Algorithmic Rationale */}
      <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-1.5">
          Algorithmic Decision Rationale
        </h4>
        <p className="text-sm text-slate-200 leading-relaxed font-sans">
          {decision.rationale}
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
            w_carbon: {Number(decision.weights.carbon_weight).toFixed(2)}
          </span>
          <span className="text-amber-400">
            w_cost: {Number(decision.weights.cost_weight).toFixed(2)}
          </span>
          <span className="text-cyan-400">
            w_latency: {Number(decision.weights.latency_weight).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Visual Subscore Breakdown */}
      <SubscoreBreakdown
        candidates={decision.candidate_rankings}
        weights={decision.weights}
      />

      {/* Candidate Rankings Detailed Table */}
      <div className="pt-2">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-3">
          Candidate Region Ranking Matrix
        </h4>
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
              {decision.candidate_rankings.map((cand) => (
                <tr
                  key={cand.region_id}
                  className={`hover:bg-slate-900/40 transition-colors ${
                    cand.rank === 1 && cand.is_feasible
                      ? "bg-emerald-950/20 font-semibold"
                      : !cand.is_feasible
                      ? "opacity-50"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono">
                    {cand.is_feasible ? (
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
                    {cand.is_feasible ? (
                      <span className="text-emerald-400 font-mono text-[11px]">Feasible</span>
                    ) : (
                      <span className="text-rose-400 font-mono text-[11px] flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {cand.rejection_reason || "Constraint Violation"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">
                    {cand.is_feasible ? Number(cand.composite_score).toFixed(4) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300">
                    {Number(cand.raw_carbon_gco2).toFixed(1)} gCO₂
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300">
                    ${Number(cand.raw_cost_usd).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300">
                    {Number(cand.raw_latency_ms).toFixed(1)} ms
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-400 text-[11px]">
                    {Number(cand.norm_carbon).toFixed(2)} / {Number(cand.norm_cost).toFixed(2)} / {Number(cand.norm_latency).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
