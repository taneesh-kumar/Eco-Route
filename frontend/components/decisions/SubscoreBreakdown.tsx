"use client";

import { CandidateRanking, SchedulingWeights } from "@/lib/types";

interface SubscoreBreakdownProps {
  candidates: CandidateRanking[];
  weights: SchedulingWeights;
}

export function SubscoreBreakdown({ candidates, weights }: SubscoreBreakdownProps) {
  const feasibleCandidates = candidates.filter((c) => c.is_feasible);

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
            <span className="w-2 h-2 rounded bg-emerald-500" /> Carbon (w: {Number(weights.carbon_weight).toFixed(2)})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-amber-500" /> Cost (w: {Number(weights.cost_weight).toFixed(2)})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-cyan-500" /> Latency (w: {Number(weights.latency_weight).toFixed(2)})
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {feasibleCandidates.map((cand) => {
          // Normalize subscores for 100% width stacked bar
          const carbonPart = Math.max(0, Number(cand.subscore_carbon));
          const costPart = Math.max(0, Number(cand.subscore_cost));
          const latencyPart = Math.max(0, Number(cand.subscore_latency));
          const totalSub = carbonPart + costPart + latencyPart || 1;

          const carbonPct = (carbonPart / totalSub) * 100;
          const costPct = (costPart / totalSub) * 100;
          const latencyPct = (latencyPart / totalSub) * 100;

          return (
            <div
              key={cand.region_id}
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
                  C = {Number(cand.composite_score).toFixed(4)}
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
                  <span className="text-emerald-400">Carbon:</span> {Number(cand.raw_carbon_gco2).toFixed(1)}g &bull; n:{Number(cand.norm_carbon).toFixed(2)}
                </div>
                <div className="text-slate-400">
                  <span className="text-amber-400">Cost:</span> ${Number(cand.raw_cost_usd).toFixed(4)} &bull; n:{Number(cand.norm_cost).toFixed(2)}
                </div>
                <div className="text-slate-400">
                  <span className="text-cyan-400">Latency:</span> {Number(cand.raw_latency_ms).toFixed(1)}ms &bull; n:{Number(cand.norm_latency).toFixed(2)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
