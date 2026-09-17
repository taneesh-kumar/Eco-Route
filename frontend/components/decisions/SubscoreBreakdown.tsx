"use client";

import { CandidateRanking, SchedulingWeights } from "@/lib/types";

interface SubscoreBreakdownProps {
  candidates?: CandidateRanking[];
  weights?: SchedulingWeights | null;
}

export function SubscoreBreakdown({ candidates = [], weights }: SubscoreBreakdownProps) {
  const safeWeights = {
    carbon_weight: Number(weights?.carbon_weight ?? 0.6),
    cost_weight: Number(weights?.cost_weight ?? 0.3),
    latency_weight: Number(weights?.latency_weight ?? 0.1),
  };

  const feasibleCandidates = (candidates || []).filter(
    (c: any) => c.is_feasible ?? (c.rank !== undefined && c.rank > 0 && !c.rejection_reason)
  );

  if (feasibleCandidates.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-400">
        No feasible candidates available to render subscore decomposition.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-400 flex items-center justify-between">
        <span>Subscore Contributions to Composite Score C</span>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500" /> Carbon (w: {safeWeights.carbon_weight.toFixed(2)})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-amber-500" /> Cost (w: {safeWeights.cost_weight.toFixed(2)})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-cyan-500" /> Latency (w: {safeWeights.latency_weight.toFixed(2)})
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {feasibleCandidates.map((cand: any) => {
          const compScore = cand.composite_score != null ? Number(cand.composite_score) : (cand.cost_score_jr != null ? Number(cand.cost_score_jr) : 0);
          const rawCarbon = cand.raw_carbon_gco2 != null ? Number(cand.raw_carbon_gco2) : (cand.emissions_co2eq != null ? Number(cand.emissions_co2eq) : 0);
          const rawCost = cand.raw_cost_usd != null ? Number(cand.raw_cost_usd) : (cand.energy_kwh != null ? Number(cand.energy_kwh) * 0.12 : 0);
          const rawLatency = cand.raw_latency_ms != null ? Number(cand.raw_latency_ms) : (cand.network_latency_ms != null ? Number(cand.network_latency_ms) : 0);
          const normCarbon = cand.norm_carbon != null ? Number(cand.norm_carbon) : (cand.score_breakdown?.norm_carbon != null ? Number(cand.score_breakdown.norm_carbon) : 0);
          const normCost = cand.norm_cost != null ? Number(cand.norm_cost) : (cand.score_breakdown?.norm_duration != null ? Number(cand.score_breakdown.norm_duration) : 0);
          const normLatency = cand.norm_latency != null ? Number(cand.norm_latency) : (cand.score_breakdown?.norm_latency != null ? Number(cand.score_breakdown.norm_latency) : 0);

          // Normalize subscores for 100% width stacked bar
          const carbonPart = Math.max(0, Number(cand.subscore_carbon ?? (cand.score_breakdown?.weighted_carbon ?? 0)));
          const costPart = Math.max(0, Number(cand.subscore_cost ?? (cand.score_breakdown?.weighted_duration ?? 0)));
          const latencyPart = Math.max(0, Number(cand.subscore_latency ?? (cand.score_breakdown?.weighted_latency ?? 0)));
          const totalSub = carbonPart + costPart + latencyPart || 1;

          const carbonPct = (carbonPart / totalSub) * 100;
          const costPct = (costPart / totalSub) * 100;
          const latencyPct = (latencyPart / totalSub) * 100;

          return (
            <div
              key={cand.region_id || cand.region_code}
              className={`p-3 rounded-lg border ${
                cand.rank === 1
                  ? "bg-emerald-950/20 border-emerald-500/30"
                  : "bg-slate-900/50 border-slate-800"
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono px-1.5 py-0.5 rounded text-[11px] font-bold ${
                      cand.rank === 1
                        ? "bg-emerald-500 text-slate-950"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    #{cand.rank}
                  </span>
                  <span className="font-semibold text-slate-200 font-mono">
                    {cand.region_code}
                  </span>
                </div>
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  C = {compScore.toFixed(4)}
                </span>
              </div>

              {/* Stacked Component Bar */}
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${carbonPct}%` }}
                  title={`Carbon: ${carbonPart.toFixed(4)} (${carbonPct.toFixed(1)}%)`}
                />
                <div
                  className="bg-amber-500 h-full transition-all duration-300"
                  style={{ width: `${costPct}%` }}
                  title={`Cost: ${costPart.toFixed(4)} (${costPct.toFixed(1)}%)`}
                />
                <div
                  className="bg-cyan-500 h-full transition-all duration-300"
                  style={{ width: `${latencyPct}%` }}
                  title={`Latency: ${latencyPart.toFixed(4)} (${latencyPct.toFixed(1)}%)`}
                />
              </div>

              {/* Raw vs Normalized metrics breakdown */}
              <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-800/60 text-[11px] font-mono">
                <div className="text-slate-400">
                  <span className="text-emerald-400">Carbon:</span> {rawCarbon.toFixed(1)}g &bull; n:{normCarbon.toFixed(2)}
                </div>
                <div className="text-slate-400">
                  <span className="text-amber-400">Cost:</span> ${rawCost.toFixed(4)} &bull; n:{normCost.toFixed(2)}
                </div>
                <div className="text-slate-400">
                  <span className="text-cyan-400">Latency:</span> {rawLatency.toFixed(1)}ms &bull; n:{normLatency.toFixed(2)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
