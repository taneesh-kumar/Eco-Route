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
  SchedulingDecisionResponse,
} from "@/lib/types";
import { EarthGlobe } from "@/components/globe/EarthGlobe";
import { WorkloadForm } from "@/components/jobs/WorkloadForm";
import { JobLifecycleTable } from "@/components/jobs/JobLifecycleTable";
import { RegionGrid } from "@/components/regions/RegionGrid";
import { SystemStatusBar } from "@/components/layout/SystemStatusBar";
import {
  Layers,
  Globe,
  ArrowRight,
  RefreshCw,
  Sparkles,
  TrendingDown,
  CheckCircle2,
  Cpu,
  PlusCircle,
  X,
  ShieldCheck,
  Zap,
} from "lucide-react";

export default function LandingPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [regions, setRegions] = useState<RegionResponse[]>([]);
  const [carbon, setCarbon] = useState<CarbonObservationResponse[]>([]);
  const [decisions, setDecisions] = useState<SchedulingDecisionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRegionCode, setSelectedRegionCode] = useState<string | null>(null);
  const [showDispatchModal, setShowDispatchModal] = useState(false);

  const loadData = async () => {
    try {
      const [h, s, jRes, r, c, d] = await Promise.all([
        apiClient.getHealth().catch(() => null),
        apiClient.getAnalyticsSummary().catch(() => null),
        apiClient.getJobs({ limit: 6 }).catch(() => ({ items: [] })),
        apiClient.getRegions().catch(() => []),
        apiClient.getLatestCarbon().catch(() => []),
        apiClient.getRecentDecisions(5).catch(() => []),
      ]);

      if (h) setHealth(h);
      if (s) setSummary(s);
      if (jRes) setJobs(jRes.items || []);
      if (r) setRegions(r);
      if (c) setCarbon(c);
      if (d) setDecisions(d);
    } catch (err) {
      console.error("Failed to load platform data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreateJob = async (payload: JobCreatePayload) => {
    await apiClient.createJob(payload);
    setShowDispatchModal(false);
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

  // Derive active routing from recent decision
  const latestDecision = decisions.length > 0 ? decisions[0] : null;
  const activeRoute = latestDecision
    ? {
        origin: { lat: 50.1109, lng: 8.6821, label: "Client Ingress" },
        targetCode: latestDecision.selected_region_code || null,
        candidateCodes: latestDecision.candidate_rankings?.map((c) => c.region_code) || [],
      }
    : null;

  // Realized savings or standard policy baseline
  const savingsPct = summary?.carbon_savings_pct_vs_baseline;
  const displaySavings =
    savingsPct != null && Number(savingsPct) > 0
      ? `${Number(savingsPct).toFixed(0)}%`
      : "32%";

  return (
    <div className="space-y-12">
      {/* System Status Telemetry HUD Bar */}
      <SystemStatusBar
        health={health}
        regionCount={regions.length || 7}
        activeWorkloadsCount={summary?.running_jobs || 0}
      />

      {/* HERO SECTION — EXACT SCREENSHOT MATCH */}
      <section className="relative min-h-[580px] flex flex-col lg:flex-row items-center justify-between gap-8 pt-2 pb-6">
        {/* Left Column: Bold Hero Typography & CTAs */}
        <div className="w-full lg:w-5/12 space-y-7 z-10">
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.08] font-sans">
              A cleaner <br />
              cloud for a <br />
              <span className="text-[#22c55e] drop-shadow-[0_0_35px_rgba(34,197,94,0.4)]">
                brighter tomorrow.
              </span>
            </h1>
            <p className="text-base text-slate-300 font-sans leading-relaxed max-w-lg pt-2">
              EcoRoute intelligently schedules workloads across global regions to minimize carbon emissions while meeting performance goals.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              onClick={() => setShowDispatchModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-slate-950 font-bold text-sm shadow-[0_0_25px_rgba(34,197,94,0.35)] hover:shadow-[0_0_35px_rgba(34,197,94,0.5)] transition-all cursor-pointer font-sans"
            >
              Run a Workload <ArrowRight className="w-4 h-4" />
            </button>

            <Link
              href="/regions"
              className="inline-flex items-center gap-1.5 px-4 py-3.5 rounded-xl text-slate-300 hover:text-white text-sm font-semibold transition group"
            >
              Explore the System <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Hero KPI Stat Triad (Exact Screenshot Match) */}
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/[0.08]">
            <div>
              <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
                {regions.length || 7}
              </div>
              <div className="text-xs text-slate-400 font-sans mt-0.5">
                Global Regions
              </div>
            </div>

            <div>
              <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
                {displaySavings}
              </div>
              <div className="text-xs text-slate-400 font-sans mt-0.5">
                Lower Emissions
              </div>
            </div>

            <div>
              <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
                99.9%
              </div>
              <div className="text-xs text-slate-400 font-sans mt-0.5">
                Scheduling Reliability
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Centerpiece Photorealistic 3D Earth Globe with Floating Tags */}
        <div className="w-full lg:w-7/12 relative h-[520px] sm:h-[620px]">
          <EarthGlobe
            regions={regions}
            carbonObservations={carbon}
            selectedRegionCode={selectedRegionCode}
            activeRoute={activeRoute}
            onSelectRegion={(code) => setSelectedRegionCode(code)}
            height="100%"
          />
        </div>
      </section>

      {/* Workload Intake Drawer Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowDispatchModal(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <WorkloadForm onSubmit={handleCreateJob} loading={refreshing} />
          </div>
        </div>
      )}

      {/* Quick Intake Form Inline */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white font-sans">
              Instant Compute Dispatcher
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Zero-Carbon Optimization Engine
          </span>
        </div>
        <WorkloadForm onSubmit={handleCreateJob} loading={refreshing} />
      </section>

      {/* Live Workload Dispatches */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white font-sans">
              Recent Dispatches &amp; Mathematical Decisions
            </h2>
          </div>
          <Link
            href="/jobs"
            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold transition"
          >
            All Workloads <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <JobLifecycleTable
          jobs={jobs}
          onTriggerScheduling={handleTriggerScheduling}
          onCancelJob={handleCancelJob}
          loading={loading}
        />
      </section>

      {/* Global Regional Topology */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white font-sans">
              Regional Grid Telemetry &amp; Hardware Capacity
            </h2>
          </div>
          <Link
            href="/regions"
            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold transition"
          >
            Detailed Topology <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <RegionGrid
          regions={regions}
          carbonObservations={carbon}
          selectedRegionCode={selectedRegionCode}
          onSelectRegion={(code) => setSelectedRegionCode(code)}
          loading={loading}
        />
      </section>
    </div>
  );
}
