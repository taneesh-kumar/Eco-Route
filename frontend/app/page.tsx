"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import {
  AnalyticsSummary,
  CarbonObservationResponse,
  HealthResponse,
  JobCreatePayload,
  JobResponse,
  RegionResponse,
} from "@/lib/types";
import { AnalyticsOverview } from "@/components/analytics/AnalyticsOverview";
import { WorkloadForm } from "@/components/jobs/WorkloadForm";
import { JobLifecycleTable } from "@/components/jobs/JobLifecycleTable";
import { RegionGrid } from "@/components/regions/RegionGrid";
import {
  Activity,
  Layers,
  Globe,
  ArrowRight,
  RefreshCw,
  Sparkles,
} from "lucide-react";

export default function DashboardOverview() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [regions, setRegions] = useState<RegionResponse[]>([]);
  const [carbon, setCarbon] = useState<CarbonObservationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [h, s, jRes, r, c] = await Promise.all([
        apiClient.getHealth().catch(() => null),
        apiClient.getAnalyticsSummary().catch(() => null),
        apiClient.getJobs({ limit: 5 }).catch(() => ({ items: [] })),
        apiClient.getRegions().catch(() => []),
        apiClient.getLatestCarbon().catch(() => []),
      ]);

      if (h) setHealth(h);
      if (s) setSummary(s);
      if (jRes) setJobs(jRes.items || []);
      if (r) setRegions(r);
      if (c) setCarbon(c);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreateJob = async (payload: JobCreatePayload) => {
    await apiClient.createJob(payload);
    await loadData();
  };

  const handleTriggerScheduling = async (jobId: string) => {
    await apiClient.triggerScheduling(jobId);
    await loadData();
  };

  const handleCancelJob = async (jobId: string) => {
    await apiClient.cancelJob(jobId);
    await loadData();
  };

  return (
    <div className="space-y-8">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            Carbon-Aware Workload Orchestration <Sparkles className="w-5 h-5 text-emerald-400" />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Dynamic spatial-temporal routing balancing carbon emissions, cloud compute cost, and network latency.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Telemetry
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {health?.status === "healthy" ? "Engine Operational" : "Telemetry Active"}
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" /> Carbon & Compute Performance
        </h2>
        <AnalyticsOverview summary={summary} loading={loading} />
      </section>

      {/* Quick Workload Intake */}
      <section className="space-y-3">
        <WorkloadForm onSubmit={handleCreateJob} loading={refreshing} />
      </section>

      {/* Recent Workload Executions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" /> Recent Workload Dispatches
          </h2>
          <Link
            href="/jobs"
            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition"
          >
            View All Workloads <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <JobLifecycleTable
          jobs={jobs}
          onTriggerScheduling={handleTriggerScheduling}
          onCancelJob={handleCancelJob}
          loading={loading}
        />
      </section>

      {/* Live Regional Infrastructure Grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" /> Global Execution Grid & Grid Telemetry
          </h2>
          <Link
            href="/regions"
            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition"
          >
            Detailed Topology <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <RegionGrid
          regions={regions}
          carbonObservations={carbon}
          loading={loading}
        />
      </section>
    </div>
  );
}
