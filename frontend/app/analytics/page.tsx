"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { AnalyticsSummary } from "@/lib/types";
import { AnalyticsOverview } from "@/components/analytics/AnalyticsOverview";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { RefreshCw, Leaf, Zap } from "lucide-react";

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

  if (loading) {
    return (
      <LoadingScreen
        message="Compiling Carbon Audit Analytics..."
        submessage="Calculating emissions savings against non-carbon conventional baselines"
      />
    );
  }

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#DCCFB5]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#075442] bg-[#075442]/10 px-2.5 py-0.5 rounded-full border border-[#075442]/20 font-semibold">
              Audit &amp; Accounting
            </span>
            <span className="text-[#A5BDAA]">&bull;</span>
            <span className="text-xs text-[#63786C] font-mono">Verified telemetry accounting</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#075442]">
            Analytics &amp; Carbon Accounting
          </h1>
          <p className="text-sm text-[#486256] mt-1.5 max-w-2xl">
            Track environmental impact, hardware energy consumption, and multi-region scheduling performance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Timeframe Filter Pills */}
          <div className="flex items-center gap-1 bg-[#FFF8EB] p-1 rounded-full border border-[#DCCFB5] text-xs font-mono">
            {(["24H", "7D", "30D", "1Y"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded-full transition cursor-pointer ${
                  timeframe === tf
                    ? "bg-[#075442] text-[#FFF8EB] font-bold shadow-xs"
                    : "text-[#63786C] hover:text-[#183B32]"
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFF8EB] hover:bg-[#FFFDF8] text-[#183B32] text-xs font-mono font-semibold border border-[#DCCFB5] shadow-xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#075442] ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards & Charts */}
      <AnalyticsOverview summary={summary} regions={regions} timeframe={timeframe} loading={loading} />

      {/* Accounting Methodology Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="ecoroute-card p-6 sm:p-7 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-[#075442] uppercase tracking-wider font-mono flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#C99B43]" /> Dynamic Energy Integration Formula
          </h3>
          <p className="text-xs text-[#63786C] leading-relaxed font-sans">
            Workload energy is calculated dynamically per attempt using real cloud hardware power curve profiles:
          </p>
          <div className="p-4 rounded-xl bg-[#FFFDF8] font-mono text-xs text-[#183B32] border border-[#DCCFB5] space-y-1.5">
            <div className="text-[#8C6212] font-semibold">P_workload = (P_peak - P_idle) &times; (CPU_demand / Max_CPU) + P_idle</div>
            <div className="text-[#075442] font-semibold">Energy (kWh) = (P_workload &times; Actual_Duration_Seconds) / (1000 &times; 3600)</div>
          </div>
        </div>

        <div className="ecoroute-card p-6 sm:p-7 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-[#075442] uppercase tracking-wider font-mono flex items-center gap-2">
            <Leaf className="w-4 h-4 text-[#075442]" /> Carbon Footprint Accounting Model
          </h3>
          <p className="text-xs text-[#63786C] leading-relaxed font-sans">
            Zero-fabrication policy guarantees that only verified, trustworthy grid telemetry contributes to recorded emissions:
          </p>
          <div className="p-4 rounded-xl bg-[#FFFDF8] font-mono text-xs text-[#183B32] border border-[#DCCFB5] space-y-1.5">
            <div className="text-[#075442] font-semibold">If CI is Trustworthy: CO₂ (g) = Energy (kWh) &times; CI (gCO₂/kWh)</div>
            <div className="text-[#63786C]">If CI is Untrusted/Unavailable: CO₂ = NULL (Unrecorded)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
