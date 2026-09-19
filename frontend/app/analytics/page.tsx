"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { AnalyticsSummary } from "@/lib/types";
import { AnalyticsOverview } from "@/components/analytics/AnalyticsOverview";
import { BarChart3, RefreshCw, Leaf, Zap } from "lucide-react";

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [regions, setRegions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<"24H" | "7D" | "30D" | "1Y">("30D");

  const fetchAnalytics = async () => {
    try {
      const [data, regData] = await Promise.all([
        apiClient.getAnalyticsSummary().catch(() => null),
        apiClient.getRegions().catch(() => []),
      ]);
      if (data) setSummary(data);
      if (regData) setRegions(regData);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#22c55e] bg-[#22c55e]/10 px-2.5 py-0.5 rounded-md border border-[#22c55e]/30 font-semibold">
              Audit &amp; Accounting
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-xs text-slate-400 font-mono">Durable Telemetry</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Analytics &amp; <span className="text-[#22c55e]">Carbon</span>
          </h1>
          <p className="text-sm text-slate-300 mt-1.5 max-w-2xl">
            Track environmental impact, hardware energy consumption, and multi-region scheduling performance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Timeframe Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            {(["24H", "7D", "30D", "1Y"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  timeframe === tf
                    ? "bg-[#22c55e] text-slate-950 font-bold shadow-md shadow-emerald-950/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setRefreshing(true);
              fetchAnalytics();
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-xs font-mono font-semibold border border-slate-700/80 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards & Charts */}
      <AnalyticsOverview summary={summary} regions={regions} timeframe={timeframe} loading={loading} />


      {/* Accounting Methodology Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 sm:p-7 rounded-2xl border border-white/[0.08] space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> Dynamic Energy Integration Formula
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Workload energy is calculated dynamically per attempt using real cloud hardware power curve profiles:
          </p>
          <div className="p-4 rounded-xl bg-slate-950/80 font-mono text-xs text-slate-300 border border-slate-800/80 space-y-1">
            <div className="text-amber-300">P_workload = (P_peak - P_idle) &times; (CPU_demand / Max_CPU) + P_idle</div>
            <div className="text-[#22c55e]">Energy (kWh) = (P_workload &times; Actual_Duration_Seconds) / (1000 &times; 3600)</div>
          </div>
        </div>

        <div className="glass-panel p-6 sm:p-7 rounded-2xl border border-white/[0.08] space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Leaf className="w-4 h-4 text-[#22c55e]" /> Carbon Footprint Accounting Model
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Zero-fabrication policy guarantees that only verified, trustworthy grid telemetry contributes to recorded emissions:
          </p>
          <div className="p-4 rounded-xl bg-slate-950/80 font-mono text-xs text-slate-300 border border-slate-800/80 space-y-1">
            <div className="text-[#22c55e]">If CI is Trustworthy: CO₂ (g) = Energy (kWh) &times; CI (gCO₂/kWh)</div>
            <div className="text-slate-400">If CI is Untrusted/Unavailable: CO₂ = NULL (Unrecorded)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
