"use client";

import { AnalyticsSummary } from "@/lib/types";
import {
  Layers,
  Zap,
  Leaf,
  CheckCircle2,
  Clock,
  TrendingDown,
  Activity,
  AlertCircle,
} from "lucide-react";

interface AnalyticsOverviewProps {
  summary: AnalyticsSummary | null;
  loading?: boolean;
}

export function AnalyticsOverview({
  summary,
  loading = false,
}: AnalyticsOverviewProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="h-28 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-8 text-center rounded-xl bg-[#0e1424] border border-slate-800 text-slate-400 text-sm">
        No analytics data available yet.
      </div>
    );
  }

  const successRate =
    summary.total_jobs > 0
      ? Math.round((summary.completed_jobs / summary.total_jobs) * 100)
      : 100;

  const hasSavings = summary.carbon_savings_pct_vs_baseline != null;
  const savingsValue = hasSavings
    ? `${summary.carbon_savings_pct_vs_baseline! >= 0 ? "+" : ""}${Number(summary.carbon_savings_pct_vs_baseline).toFixed(1)}%`
    : "N/A";
  const savingsDesc = hasSavings
    ? "Realized carbon reduction vs conventional baseline"
    : "Awaiting completed decisions with counterfactual baseline";

  const kpis = [
    {
      label: "Carbon Reduction vs Baseline",
      value: savingsValue,
      desc: savingsDesc,
      icon: TrendingDown,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
    },
    {
      label: "Total Workloads Ingested",
      value: summary.total_jobs.toLocaleString(),
      desc: `${summary.running_jobs} currently running &bull; ${summary.waiting_jobs} deferred`,
      icon: Layers,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
    },
    {
      label: "Total Energy Consumed",
      value: `${Number(summary.total_energy_kwh).toFixed(2)} kWh`,
      desc: "Calculated via delta power integration",
      icon: Zap,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
    },
    {
      label: "Observed Carbon Emissions",
      value: `${Number(summary.total_co2eq_grams).toFixed(1)} gCO₂`,
      desc: "Zero-fabrication: untrusted carbon excluded",
      icon: Leaf,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
    },
    {
      label: "Success Rate",
      value: `${successRate}%`,
      desc: `${summary.completed_jobs} completed &bull; ${summary.failed_jobs} failed`,
      icon: CheckCircle2,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30",
    },
    {
      label: "Total Execution Attempts",
      value: summary.total_attempts.toLocaleString(),
      desc: "Idempotent CAS claims in PostgreSQL",
      icon: Activity,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/30",
    },
    {
      label: "Avg Workload Duration",
      value: `${Number(summary.avg_job_duration_seconds).toFixed(1)}s`,
      desc: "Across completed batch & inference jobs",
      icon: Clock,
      color: "text-slate-300",
      bg: "bg-slate-800/60",
      border: "border-slate-700/60",
    },
    {
      label: "Carbon Slack Deferrals",
      value: summary.waiting_jobs.toLocaleString(),
      desc: "Deferred waiting for greener grid windows",
      icon: AlertCircle,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <div
            key={idx}
            className="p-5 rounded-xl bg-[#0e1424] border border-slate-800/80 shadow-sm flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs text-slate-400 font-medium block">
                  {kpi.label}
                </span>
                <span className={`text-2xl font-bold font-mono mt-1 block ${kpi.color}`}>
                  {kpi.value}
                </span>
              </div>
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center border ${kpi.bg} ${kpi.border} ${kpi.color}`}
              >
                <Icon className="w-5 h-5" />
              </div>
            </div>
            <div
              className="text-[11px] text-slate-400 mt-3 pt-2.5 border-t border-slate-800/60 font-sans"
              dangerouslySetInnerHTML={{ __html: kpi.desc }}
            />
          </div>
        );
      })}
    </div>
  );
}
