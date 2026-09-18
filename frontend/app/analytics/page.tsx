"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { AnalyticsSummary } from "@/lib/types";
import { AnalyticsOverview } from "@/components/analytics/AnalyticsOverview";
import { BarChart3, RefreshCw, Leaf, Zap, ShieldCheck } from "lucide-react";

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = async () => {
    try {
      const data = await apiClient.getAnalyticsSummary();
      setSummary(data);
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-emerald-400" /> Platform Analytics &amp; Carbon Accounting
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Auditable energy, emissions, and execution reliability telemetry computed from PostgreSQL attempts.
          </p>
        </div>

        <button
          onClick={() => {
            setRefreshing(true);
            fetchAnalytics();
          }}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Metrics
        </button>
      </div>

      {/* KPI Cards */}
      <AnalyticsOverview summary={summary} loading={loading} />

      {/* Accounting Methodology Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-[#0e1424] border border-slate-800/80 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> Energy Calculation Methodology
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Workload energy is calculated dynamically per attempt using cloud hardware power profiles:
          </p>
          <div className="p-3 rounded bg-slate-900/80 font-mono text-xs text-slate-300 border border-slate-800">
            P_workload = (P_peak - P_idle) &times; (CPU_demand / Max_CPU) + P_idle
            <br />
            Energy (kWh) = (P_workload &times; Actual_Duration_Seconds) / (1000 &times; 3600)
          </div>
        </div>

        <div className="p-6 rounded-xl bg-[#0e1424] border border-slate-800/80 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Leaf className="w-4 h-4 text-emerald-400" /> Carbon Footprint Accounting
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Zero-fabrication policy guarantees that only verified, trustworthy grid telemetry contributes to recorded emissions:
          </p>
          <div className="p-3 rounded bg-slate-900/80 font-mono text-xs text-slate-300 border border-slate-800">
            If CI is trustworthy: CO₂ (g) = Energy (kWh) &times; CI (gCO₂/kWh)
            <br />
            If CI is untrusted/unavailable: CO₂ = NULL (unrecorded)
          </div>
        </div>
      </div>
    </div>
  );
}
