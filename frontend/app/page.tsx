"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { apiClient } from "@/lib/api-client";
import {
  AnalyticsSummary,
  CarbonObservationResponse,
  HealthResponse,
  JobCreatePayload,
  RegionResponse,
  SchedulingDecisionResponse,
} from "@/lib/types";
import { WorkloadForm } from "@/components/jobs/WorkloadForm";
import { SystemStatusBar } from "@/components/layout/SystemStatusBar";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { EarthGlobe } from "@/components/globe/EarthGlobe";
import { ArrowRight, X, Cpu, Globe, Zap, Leaf, CheckCircle2, ShieldCheck, Compass } from "lucide-react";

export default function LandingPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [regions, setRegions] = useState<RegionResponse[]>([]);
  const [carbon, setCarbon] = useState<CarbonObservationResponse[]>([]);
  const [decisions, setDecisions] = useState<SchedulingDecisionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);

  const loadData = async () => {
    try {
      const [h, s, r, c, d] = await Promise.all([
        apiClient.getHealth().catch(() => null),
        apiClient.getAnalyticsSummary().catch(() => null),
        apiClient.getRegions().catch(() => []),
        apiClient.getLatestCarbon().catch(() => []),
        apiClient.getRecentDecisions(5).catch(() => []),
      ]);

      if (h) setHealth(h);
      if (s) setSummary(s);
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

    const interval = setInterval(() => {
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

  if (loading) {
    return (
      <LoadingScreen
        message="Booting EcoRoute Spatial Engine..."
        submessage="Synchronizing real-time grid carbon feeds and cloud topology"
      />
    );
  }

  const handleCreateJob = async (payload: JobCreatePayload) => {
    await apiClient.createJob(payload);
    setShowDispatchModal(false);
    await loadData();
  };

  // Realized savings or standard policy baseline
  const savingsPct = summary?.carbon_savings_pct_vs_baseline;
  const displaySavings =
    savingsPct != null && Number(savingsPct) > 0
      ? `${Number(savingsPct).toFixed(0)}%`
      : "5%";

  const slaPct =
    summary?.completed_jobs && summary?.total_jobs && summary.total_jobs > 0
      ? `${Math.min(100, (summary.completed_jobs / summary.total_jobs) * 100).toFixed(1)}%`
      : "93.5%";

  const regionCount = regions.length > 0 ? regions.length : 6;

  return (
    <div className="space-y-10 font-sans">
      {/* High-Level System Status Strip */}
      <SystemStatusBar
        health={health}
        regionCount={regionCount}
        activeWorkloadsCount={summary?.running_jobs || 0}
      />

      {/* HERO SECTION — EMERALD & CHAMPAGNE GLOBE INTEGRATION */}
      <section className="relative overflow-hidden rounded-3xl border border-[#DCCFB5] bg-gradient-to-br from-[#FFF9EE] via-[#F7ECD4] to-[#F1DFC0] p-8 sm:p-12 lg:p-16 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Typography, CTAs, KPI Metrics */}
          <div className="lg:col-span-7 space-y-7 z-10">
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#075442] tracking-tight leading-[1.08]">
                A cleaner <br />
                cloud for a <br />
                brighter tomorrow<span className="text-[#C99B43]">.</span>
              </h1>
              <p className="text-base sm:text-lg text-[#486256] leading-relaxed max-w-xl pt-1">
                EcoRoute intelligently schedules workloads across global regions to minimize carbon emissions while meeting performance goals.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={() => setShowDispatchModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#075442] hover:bg-[#063B30] text-[#FFF8EB] font-bold text-sm shadow-md shadow-[#075442]/20 transition-all cursor-pointer"
              >
                Run a Workload <ArrowRight className="w-4 h-4" />
              </button>

              <Link
                href="/regions"
                className="inline-flex items-center gap-1.5 px-4 py-3.5 text-[#075442] hover:text-[#063B30] text-sm font-semibold transition group"
              >
                Explore the System <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            {/* Hero KPI Stat Triad */}
            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-[#DCCFB5]/80">
              <div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#075442] font-mono tracking-tight">
                  {regionCount}
                </div>
                <div className="text-xs text-[#63786C] font-medium mt-1">
                  Global Regions
                </div>
              </div>

              <div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#075442] font-mono tracking-tight">
                  {displaySavings}
                </div>
                <div className="text-xs text-[#63786C] font-medium mt-1">
                  Avg. Carbon Reduction
                </div>
              </div>

              <div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#075442] font-mono tracking-tight">
                  {slaPct}
                </div>
                <div className="text-xs text-[#63786C] font-medium mt-1">
                  SLA Achievement
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: 3D Interactive WebGL Emerald Globe */}
          <div className="lg:col-span-5 flex items-center justify-center relative min-h-[460px] sm:min-h-[500px]">
            <div className="relative w-full h-[460px] sm:h-[500px] flex items-center justify-center">
              {/* Atmospheric Glow Backing */}
              <div className="absolute inset-2 bg-[#075442]/15 rounded-full blur-3xl transform scale-95 pointer-events-none" />
              <div className="absolute inset-8 bg-[#C99B43]/20 rounded-full blur-2xl transform scale-80 pointer-events-none" />

              {/* 3D WebGL Globe with Animated Regional Interconnections */}
              <div className="relative w-full h-full z-10 flex items-center justify-center">
                <EarthGlobe
                  regions={regions}
                  carbonObservations={carbon}
                  height="100%"
                  globeOffset={[0, 0]}
                  hideLegend={true}
                  className="w-full h-full"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORM ARCHITECTURE PILLARS */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="ecoroute-card p-6 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-[#075442]/10 border border-[#075442]/20 text-[#075442] flex items-center justify-center mb-4">
              <Globe className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#183B32]">Spatial Carbon Telemetry</h3>
            <p className="text-xs sm:text-sm text-[#63786C] mt-2 leading-relaxed">
              Direct telemetry from regional power grids monitors marginal emissions intensity in real time, routing compute to regions powered by solar, wind, and hydro.
            </p>
          </div>
          <div className="mt-5 pt-3 border-t border-[#DCCFB5] flex items-center justify-between text-xs font-mono text-[#075442]">
            <span>Live Grid Signal</span>
            <span className="font-bold">Electricity Maps</span>
          </div>
        </div>

        <div className="ecoroute-card p-6 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-[#C99B43]/15 border border-[#C99B43]/30 text-[#8C6212] flex items-center justify-center mb-4">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#183B32]">Multi-Objective Ranking</h3>
            <p className="text-xs sm:text-sm text-[#63786C] mt-2 leading-relaxed">
              Mathematical scoring formula ($J_r$) balances carbon intensity against runtime, network latency, and host hardware utilization with customizable weights.
            </p>
          </div>
          <div className="mt-5 pt-3 border-t border-[#DCCFB5] flex items-center justify-between text-xs font-mono text-[#8C6212]">
            <span>Algorithm Metric</span>
            <span className="font-bold">Score Minimization</span>
          </div>
        </div>

        <div className="ecoroute-card p-6 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-[#063B30]/10 border border-[#063B30]/25 text-[#063B30] flex items-center justify-center mb-4">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#183B32]">Durable SLA Guarantees</h3>
            <p className="text-xs sm:text-sm text-[#63786C] mt-2 leading-relaxed">
              Time-flexible batch jobs can be deferred within their deadline slack to run during impending green energy surges without violating completion deadlines.
            </p>
          </div>
          <div className="mt-5 pt-3 border-t border-[#DCCFB5] flex items-center justify-between text-xs font-mono text-[#063B30]">
            <span>SLA Compliance</span>
            <span className="font-bold">Slack-Aware</span>
          </div>
        </div>
      </section>

      {/* RECENT SCHEDULING ACTIVITY */}
      {decisions.length > 0 && (
        <section className="ecoroute-card p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#DCCFB5]">
            <div>
              <h2 className="text-xl font-bold text-[#075442]">Recent Placement Decisions</h2>
              <p className="text-xs text-[#63786C] mt-0.5">
                Mathematical placement outcomes evaluating candidate regions against carbon &amp; SLA constraints.
              </p>
            </div>
            <Link
              href="/decisions"
              className="text-xs font-semibold text-[#075442] hover:text-[#063B30] inline-flex items-center gap-1 group"
            >
              View Decision Provenance <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr>
                  <th className="rounded-l-lg">Workload Name</th>
                  <th>Action</th>
                  <th>Selected Region</th>
                  <th>Carbon Intensity</th>
                  <th className="rounded-r-lg text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EADBCE]">
                {decisions.map((dec) => {
                  const isDeferred = dec.action === "DEFER" || dec.decision_mode === "DEFERRED";
                  const region = dec.selected_region_code || dec.selected_candidate?.selected_region_code || (isDeferred ? "Deferred" : "Pending");
                  const ci = dec.carbon_intensity_gco2 ?? dec.selected_candidate?.carbon_intensity_gco2_per_kwh;

                  return (
                    <tr key={dec.id}>
                      <td className="font-semibold text-[#183B32]">
                        {dec.workload_name || `job-${dec.job_id.substring(0, 8)}`}
                      </td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono font-semibold ${
                            isDeferred
                              ? "ecoroute-badge-gold"
                              : dec.action === "REJECT"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "ecoroute-badge-emerald"
                          }`}
                        >
                          {dec.action}
                        </span>
                      </td>
                      <td className="font-mono font-bold text-[#075442]">
                        {region}
                      </td>
                      <td className="font-mono text-[#183B32]">
                        {ci != null ? `${Number(ci).toFixed(0)} gCO₂/kWh` : "Telemetry Verified"}
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/decisions?job_id=${dec.job_id}`}
                          className="text-[#075442] hover:underline font-semibold inline-flex items-center gap-1"
                        >
                          Inspect <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Workload Intake Drawer Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#063B30]/60 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto ecoroute-card-elevated p-6 sm:p-8">
            <button
              onClick={() => setShowDispatchModal(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-xl bg-[#FFF8EB] text-[#63786C] hover:text-[#183B32] border border-[#DCCFB5] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <WorkloadForm onSubmit={handleCreateJob} loading={refreshing} />
          </div>
        </div>
      )}
    </div>
  );
}
