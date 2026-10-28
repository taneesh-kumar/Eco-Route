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
import { SpaceStarfield } from "@/components/globe/SpaceStarfield";
import { WorkloadForm } from "@/components/jobs/WorkloadForm";
import { JobLifecycleTable } from "@/components/jobs/JobLifecycleTable";
import { RegionGrid } from "@/components/regions/RegionGrid";
import { SystemStatusBar } from "@/components/layout/SystemStatusBar";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import {
  StatusNotificationBanner,
  StatusNotification,
} from "@/components/ui/StatusNotificationBanner";
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
  const [notification, setNotification] = useState<StatusNotification | null>(null);

  // Handle Escape key and body scroll lock for dispatch modal
  useEffect(() => {
    if (!showDispatchModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDispatchModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [showDispatchModal]);

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

      setHealth(h);
      setSummary(s);
      if (jRes) setJobs(jRes.items || []);
      setRegions(r || []);
      setCarbon(c || []);
      setDecisions(d || []);
    } catch (err) {
      console.error("Failed to load platform data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      // Pause polling when browser tab is hidden/backgrounded to avoid wasteful queries
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      loadData();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadData();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);


  const handleManualRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <LoadingScreen
        message="Booting EcoRoute Spatial Engine..."
        submessage="Synchronizing real-time grid carbon feeds and cloud topology"
      />
    );
  }

  const handleCreateJob = async (payload: JobCreatePayload) => {
    try {
      await apiClient.createJob(payload);
      setShowDispatchModal(false);
      setNotification({
        type: "success",
        title: "Workload Submitted",
        message: `Workload "${payload.workload_name}" was successfully evaluated and queued.`,
      });
      await loadData();
    } catch (err: any) {
      console.error("Job creation failed:", err);
      setNotification({
        type: "error",
        title: "Submission Error",
        message: err?.message || "Failed to create workload.",
      });
    }
  };

  const handleTriggerScheduling = async (jobId: string) => {
    try {
      const res = await apiClient.triggerScheduling(jobId);
      if (res.decision_action === "REJECT") {
        setNotification({
          type: "warning",
          title: "Workload Infeasible",
          message:
            res.decision_reason ||
            "Deadline slack is exhausted or no cloud region meets requirements.",
        });
      } else {
        setNotification({
          type: "success",
          title: "Evaluation Completed",
          message: `Decision action: ${res.decision_action || "SCHEDULED"}. Assigned: ${
            res.selected_region_code || "Selected Region"
          }`,
        });
      }
      await loadData();
    } catch (err: any) {
      console.error("Scheduling evaluation failed:", err);
      setNotification({
        type: "error",
        title: "Evaluation Error",
        message: err?.message || "Scheduling evaluation failed.",
      });
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await apiClient.cancelJob(jobId);
      setNotification({
        type: "info",
        title: "Workload Cancelled",
        message: `Workload ID ${jobId.substring(0, 8)}... was successfully marked as cancelled.`,
      });
      await loadData();
    } catch (err: any) {
      console.error("Job cancellation failed:", err);
      setNotification({
        type: "error",
        title: "Cancellation Failed",
        message: err?.message || "Workload could not be cancelled.",
      });
    }
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

  // Realized savings or truthful placeholder
  const savingsPct = summary?.carbon_savings_pct_vs_baseline;
  let displaySavings: string;
  let savingsSubtext: string;
  if (loading) {
    displaySavings = "--";
    savingsSubtext = "Loading metrics...";
  } else if (savingsPct != null && Number(savingsPct) > 0) {
    displaySavings = `${Number(savingsPct).toFixed(0)}%`;
    savingsSubtext = "Lower Emissions";
  } else if (savingsPct != null && Number(savingsPct) === 0) {
    displaySavings = "0%";
    savingsSubtext = "No Emissions Reduction";
  } else {
    displaySavings = "--";
    savingsSubtext = "No Baseline Telemetry";
  }

  return (
    <div className="space-y-12">
      {/* System Status Telemetry HUD Bar */}
      <SystemStatusBar
        health={health}
        loading={loading}
        regionCount={regions.length}
        activeWorkloadsCount={summary?.running_jobs || 0}
      />

      {/* Non-blocking Accessible Notification Banner */}
      <StatusNotificationBanner
        notification={notification}
        onDismiss={() => setNotification(null)}
      />

      {/* HERO SECTION — FULL 3D SPACE GLOBE ENVIRONMENT */}
      <section className="relative -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 overflow-hidden rounded-3xl min-h-[660px] sm:min-h-[720px] flex items-center">
        {/* Full-width 3D WebGL Globe & Continuous Space Environment */}
        <div className="absolute inset-0 z-0">
          <EarthGlobe
            regions={regions}
            carbonObservations={carbon}
            selectedRegionCode={selectedRegionCode}
            activeRoute={activeRoute}
            onSelectRegion={(code) => setSelectedRegionCode(code)}
            height="100%"
          />
        </div>

        {/* Hero Content Left Column: Typography, CTAs, KPI Metrics */}
        <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-8 pointer-events-none">
          <div className="w-full lg:w-5/12 space-y-7 pointer-events-auto">
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

            {/* Hero KPI Stat Triad */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/[0.08]">
              <div>
                <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
                  {loading ? "--" : regions.length}
                </div>
                <div className="text-xs text-slate-400 font-sans mt-0.5">
                  {loading
                    ? "Loading Regions..."
                    : regions.length === 1
                    ? "Global Region"
                    : "Global Regions"}
                </div>
              </div>

              <div>
                <div className="text-3xl font-extrabold text-[#22c55e] font-mono tracking-tight">
                  {displaySavings}
                </div>
                <div className="text-xs text-slate-400 font-sans mt-0.5">
                  {savingsSubtext}
                </div>
              </div>

              <div>
                <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
                  {loading
                    ? "--"
                    : summary?.total_jobs != null && summary.total_jobs > 0
                    ? `${Math.min(
                        100,
                        ((summary.completed_jobs ?? 0) / summary.total_jobs) * 100
                      ).toFixed(1)}%`
                    : summary?.total_jobs === 0
                    ? "100%"
                    : "--"}
                </div>
                <div className="text-xs text-slate-400 font-sans mt-0.5">
                  {loading
                    ? "Checking Telemetry..."
                    : summary?.total_jobs != null && summary.total_jobs > 0
                    ? "Dispatch Reliability"
                    : summary?.total_jobs === 0
                    ? "0 Dispatches Logged"
                    : "Reliability Telemetry"}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column Spacer */}
          <div className="w-full lg:w-7/12 pointer-events-none hidden lg:block" />
        </div>
      </section>

      {/* Workload Intake Modal Dialog */}
      {showDispatchModal && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDispatchModal(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="intake-modal-title"
            className="glass-panel relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.12] bg-[#070b14]/95 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8),0_0_30px_rgba(34,197,94,0.1)] animate-in zoom-in-95 duration-200 flex flex-col"
          >
            {/* Modal Accessible Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-slate-950/90 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[#22c55e]">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="intake-modal-title" className="text-base font-bold text-white font-sans">
                    Autonomous Workload Dispatcher
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Configure parameters for carbon-aware spatial routing
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowDispatchModal(false)}
                aria-label="Close workload intake modal"
                className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto">
              <WorkloadForm onSubmit={handleCreateJob} loading={refreshing} />
            </div>
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
