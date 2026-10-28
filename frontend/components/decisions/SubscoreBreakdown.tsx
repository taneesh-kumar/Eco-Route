"use client";

import { CandidateRanking, SchedulingWeights } from "@/lib/types";

interface SubscoreBreakdownProps {
  candidates?: CandidateRanking[];
  weights?: SchedulingWeights | null;
  selectedRegionCode?: string | null;
  action?: string;
}

const metricConfig = [
  { key: "carbon", label: "Carbon", color: "bg-[#075442]", text: "text-[#075442]", weightKey: "carbon_weight" },
  { key: "duration", label: "Duration", color: "bg-[#063B30]", text: "text-[#063B30]", weightKey: "time_weight" },
  { key: "utilization", label: "Utilization", color: "bg-[#C99B43]", text: "text-[#8C6212]", weightKey: "utilization_weight" },
  { key: "latency", label: "Latency", color: "bg-[#5A7C6E]", text: "text-[#38594E]", weightKey: "latency_weight" },
] as const;

export function SubscoreBreakdown({ candidates = [], weights, selectedRegionCode = null, action = "" }: SubscoreBreakdownProps) {
  const activeWeights = {
    carbon_weight: Number(weights?.carbon_weight ?? 0.4),
    time_weight: Number(weights?.time_weight ?? weights?.cost_weight ?? 0.3),
    utilization_weight: Number(weights?.utilization_weight ?? 0.2),
    latency_weight: Number(weights?.latency_weight ?? 0.1),
  };

  const rows = candidates.filter((candidate: any) => candidate.is_feasible !== false);
  const value = (raw: unknown) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
  };
  const score = (candidate: any) => Number(candidate.composite_score ?? candidate.cost_score_jr ?? 0);

  if (rows.length === 0) {
    return <div className="p-4 text-center text-xs text-[#63786C] font-mono">No feasible candidate metrics available.</div>;
  }

  return (
    <div className="ecoroute-card p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 border-b border-[#DCCFB5] pb-3">
        <div>
          <h4 className="text-xs font-bold text-[#075442] uppercase tracking-wider font-mono">Candidate Objective Breakdown</h4>
          <p className="text-[11px] text-[#63786C] mt-1 font-sans">Normalized values are shown as bars. Lower is better; Jr is the weighted composite sum used for ranking.</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono">
          {metricConfig.map((metric) => (
            <span key={metric.key} className={`inline-flex items-center gap-1.5 ${metric.text} font-semibold`}>
              <span className={`w-2.5 h-2.5 rounded-full ${metric.color}`} />
              {metric.label} {((activeWeights as any)[metric.weightKey] * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[150px_1fr_80px] gap-3 items-center pb-2 text-[10px] uppercase tracking-wider text-[#63786C] font-mono border-b border-[#DCCFB5] font-semibold">
            <span>Region</span>
            <span>Normalized Objective Bars (0.00 = Best)</span>
            <span className="text-right">Jr Score</span>
          </div>
          <div className="divide-y divide-[#EADBCE]">
            {rows.map((candidate: any) => {
              const metrics = {
                carbon: value(candidate.norm_carbon),
                duration: value(candidate.norm_duration ?? candidate.norm_cost),
                utilization: value(candidate.norm_utilization),
                latency: value(candidate.norm_latency),
              };
              const selected = action === "EXECUTE" && candidate.region_code === selectedRegionCode;
              const bestUnassigned = action === "DEFER" && candidate.rank === 1;
              const marker = selected ? "Selected" : bestUnassigned ? "Best / Deferred" : `#${candidate.rank}`;
              return (
                <div key={candidate.region_id || candidate.region_code} className={`grid grid-cols-[150px_1fr_80px] gap-3 items-center py-3 ${selected ? "bg-[#FFFDF8] font-semibold rounded-lg px-2" : ""}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${selected ? "bg-[#075442] text-[#FFF8EB]" : bestUnassigned ? "ecoroute-badge-gold" : "bg-[#FFFDF8] text-[#486256] border border-[#DCCFB5]"}`}>{marker}</span>
                    <span className="truncate text-xs font-bold text-[#183B32] font-mono">{candidate.region_code}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {metricConfig.map((metric) => {
                      const normalized = metrics[metric.key];
                      const weight = Number((activeWeights as any)[metric.weightKey]);
                      const contribution = normalized * weight;
                      return (
                        <div key={metric.key} title={`${metric.label}: normalized ${normalized.toFixed(3)}, weighted contribution ${contribution.toFixed(4)}`}>
                          <div className="flex justify-between text-[10px] font-mono mb-1">
                            <span className={metric.text}>{metric.label}</span>
                            <span className="text-[#63786C] font-semibold">{normalized.toFixed(2)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-[#EADBCE] overflow-hidden">
                            <div className={`h-full rounded-full ${metric.color}`} style={{ width: `${normalized * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-right text-xs font-extrabold text-[#075442] font-mono">{score(candidate).toFixed(4)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
