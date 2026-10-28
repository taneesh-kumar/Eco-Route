"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { JobCreatePayload, JobResponse } from "@/lib/types";
import { WorkloadForm } from "@/components/jobs/WorkloadForm";
import { JobLifecycleTable } from "@/components/jobs/JobLifecycleTable";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Filter, RefreshCw } from "lucide-react";
import {
  StatusNotificationBanner,
  StatusNotification,
} from "@/components/ui/StatusNotificationBanner";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [notification, setNotification] = useState<StatusNotification | null>(null);

  const fetchJobs = async () => {
    try {
      const params = filterStatus === "ALL" ? { limit: 100 } : { status: filterStatus, limit: 100 };
      const [jobsRes, healthRes] = await Promise.allSettled([
        apiClient.getJobs(params),
        apiClient.getHealth(),
      ]);
      if (jobsRes.status === "fulfilled") {
        setJobs(jobsRes.value.items || []);
      }
      if (healthRes.status === "fulfilled") {
        setHealth(healthRes.value);
      }
    } catch (err) {
      console.error("Failed to load jobs or health:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 8000);
    return () => clearInterval(interval);
  }, [filterStatus]);

  const handleCreateJob = async (payload: JobCreatePayload) => {
    try {
      const res = await apiClient.createJob(payload);
      setNotification({
        type: "success",
        title: "Workload Submitted",
        message: `Workload "${payload.workload_name}" was successfully evaluated and queued.`,
      });
    } catch (err: any) {
      console.error("Job creation failed:", err);
      setNotification({
        type: "error",
        title: "Submission Error",
        message: err.message || "Failed to create workload.",
      });
    } finally {
      await fetchJobs();
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
    } catch (err: any) {
      console.error("Scheduling evaluation failed:", err);
      setNotification({
        type: "error",
        title: "Evaluation Error",
        message: err.message || "Scheduling evaluation failed.",
      });
    } finally {
      await fetchJobs();
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
    } catch (err: any) {
      console.error("Job cancellation failed:", err);
      setNotification({
        type: "error",
        title: "Cancellation Failed",
        message: err.message || "Workload could not be cancelled.",
      });
    } finally {
      await fetchJobs();
    }
  };

  const statuses = [
    { label: "All Workloads", value: "ALL" },
    { label: "Queued", value: "PENDING" },
    { label: "Running", value: "RUNNING" },
    { label: "Deferred", value: "WAITING" },
    { label: "Scheduled", value: "SCHEDULED" },
    { label: "Completed", value: "COMPLETED" },
    { label: "Failed", value: "FAILED" },
  ];

  // Derive counts from current jobs for live tab visibility
  const statusCounts: Record<string, number> = {
    ALL: jobs.length,
    PENDING: jobs.filter((j) => j.status === "PENDING").length,
    RUNNING: jobs.filter((j) => j.status === "RUNNING").length,
    WAITING: jobs.filter((j) => j.status === "WAITING").length,
    SCHEDULED: jobs.filter((j) => j.status === "SCHEDULED").length,
    COMPLETED: jobs.filter((j) => j.status === "COMPLETED").length,
    FAILED: jobs.filter((j) => j.status === "FAILED").length,
  };

  const rawDbStatus = health?.components?.database?.status;
  const dbStatus = !health
    ? loading
      ? "checking..."
      : "unreachable"
    : rawDbStatus || "unknown";

  const rawRedisStatus = health?.components?.redis?.status;
  const isRedisConnected = rawRedisStatus === "connected";
  const isRedisFallback = rawRedisStatus === "unconfigured" || rawRedisStatus === "in-memory fallback";
  const isRedisChecking = !health && loading;
  const isRedisUnreachable = !health && !loading;

  const queueLabel = isRedisConnected
    ? "redis"
    : isRedisFallback
    ? "in-memory fallback"
    : isRedisChecking
    ? "checking..."
    : isRedisUnreachable
    ? "unreachable"
    : rawRedisStatus === "unavailable"
    ? "unavailable"
    : rawRedisStatus || "unknown";

  const queueBadgeClass = isRedisConnected
    ? "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30"
    : isRedisFallback
    ? "bg-amber-950/60 text-amber-400 border-amber-800/60"
    : isRedisChecking
    ? "bg-slate-900/60 text-slate-400 border-slate-700"
    : "bg-red-950/60 text-red-400 border-red-800/60";

  if (loading) {
    return (
      <LoadingScreen
        message="Loading Workload Telemetry..."
        submessage="Connecting to execution queue and database persistence"
      />
    );
  }

  return (
    <div className="space-y-8 font-sans">
      {/* Non-blocking Accessible Notification Banner */}
      <StatusNotificationBanner
        notification={notification}
        onDismiss={() => setNotification(null)}
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#22c55e] bg-[#22c55e]/10 px-2.5 py-0.5 rounded-md border border-[#22c55e]/30 font-semibold">
              Workload Lifecycle Pipeline
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-xs text-slate-400 font-mono">Durable State Machine</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Workload <span className="text-[#22c55e]">Command Center</span>
          </h1>
          <p className="text-sm text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
            Submit compute demands, inspect real-time execution states, and track multi-objective optimization across cloud regions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
            <span
              className={`px-3 py-1 rounded-xl border ${
                dbStatus === "connected"
                  ? "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30"
                  : dbStatus === "checking..."
                  ? "bg-slate-900/60 text-slate-400 border-slate-700"
                  : "bg-red-950/60 text-red-400 border-red-800/60"
              }`}
            >
              DB: {dbStatus}
            </span>
            <span
              className={`px-3 py-1 rounded-xl border ${queueBadgeClass}`}
            >
              Queue: {queueLabel}
            </span>
          </div>

          <button
            onClick={() => {
              setRefreshing(true);
              fetchJobs();
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-xs font-mono font-semibold border border-slate-700/80 transition cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Intake Form & Lifecycle Pipeline Visualizer */}
      <WorkloadForm onSubmit={handleCreateJob} loading={refreshing} />

      {/* Filter Tabs with Live Status Counts for Queue Visibility */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span className="flex items-center gap-1.5 font-semibold text-slate-300">
            <Filter className="w-3.5 h-3.5 text-[#22c55e]" /> Workload Queue Filter:
          </span>
          <span className="text-[11px] text-slate-500">
            Showing {filterStatus === "ALL" ? "all" : filterStatus.toLowerCase()} records
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          {statuses.map((s) => {
            const isSelected = filterStatus === s.value;
            const count = statusCounts[s.value] ?? 0;
            return (
              <button
                key={s.value}
                onClick={() => setFilterStatus(s.value)}
                className={`text-xs px-3.5 py-1.5 rounded-xl font-mono font-medium transition cursor-pointer shrink-0 flex items-center gap-2 ${
                  isSelected
                    ? "bg-[#22c55e] text-slate-950 font-bold shadow-md shadow-emerald-950/40"
                    : "bg-slate-900/80 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700"
                }`}
              >
                <span>{s.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected
                      ? "bg-slate-950/30 text-slate-950"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lifecycle Table */}
      <JobLifecycleTable
        jobs={jobs}
        onTriggerScheduling={handleTriggerScheduling}
        onCancelJob={handleCancelJob}
        loading={loading}
      />
    </div>
  );
}
