"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { JobCreatePayload, JobResponse } from "@/lib/types";
import { WorkloadForm } from "@/components/jobs/WorkloadForm";
import { JobLifecycleTable } from "@/components/jobs/JobLifecycleTable";
import { Layers, Filter, RefreshCw, Database, Server } from "lucide-react";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState<any>(null);

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
      await apiClient.createJob(payload);
    } catch (err: any) {
      console.error("Job creation failed:", err);
      alert(err.message || "Failed to create job.");
    } finally {
      await fetchJobs();
    }
  };

  const handleTriggerScheduling = async (jobId: string) => {
    try {
      const res = await apiClient.triggerScheduling(jobId);
      if (res.decision_action === "REJECT") {
        alert(`Workload Infeasible: ${res.decision_reason || "Deadline slack is exhausted."}`);
      }
    } catch (err: any) {
      console.error("Scheduling evaluation failed:", err);
      alert(err.message || "Scheduling evaluation failed.");
    } finally {
      await fetchJobs();
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await apiClient.cancelJob(jobId);
    } catch (err: any) {
      console.error("Job cancellation failed:", err);
    } finally {
      await fetchJobs();
    }
  };

  const statuses = [
    { label: "All Workloads", value: "ALL" },
    { label: "Pending", value: "PENDING" },
    { label: "Running", value: "RUNNING" },
    { label: "Deferred", value: "WAITING" },
    { label: "Scheduled", value: "SCHEDULED" },
    { label: "Completed", value: "COMPLETED" },
    { label: "Failed", value: "FAILED" },
  ];

  const dbStatus = health?.components?.database?.status || "connected";
  const redisStatus = health?.components?.redis?.status || "connected";

  return (
    <div className="space-y-8 font-sans">
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
          <p className="text-sm text-slate-300 mt-1.5 max-w-2xl">
            Submit compute demands, configure multi-objective optimization weights ($J_r$), and manage execution lifecycles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
            <span
              className={`px-3 py-1 rounded-xl border ${
                dbStatus === "connected"
                  ? "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30"
                  : "bg-red-950/60 text-red-400 border-red-800/60"
              }`}
            >
              DB: {dbStatus}
            </span>
            <span
              className={`px-3 py-1 rounded-xl border ${
                redisStatus === "connected"
                  ? "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30"
                  : "bg-amber-950/60 text-amber-400 border-amber-800/60"
              }`}
            >
              Queue: {redisStatus === "connected" ? "redis" : "in-memory"}
            </span>
          </div>

          <button
            onClick={() => {
              setRefreshing(true);
              fetchJobs();
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-xs font-mono font-semibold border border-slate-700/80 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Intake Form & What Happens Next Flow */}
      <WorkloadForm onSubmit={handleCreateJob} loading={refreshing} />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-white/[0.06]">
        <span className="text-xs text-slate-400 flex items-center gap-1.5 mr-1 font-mono font-semibold">
          <Filter className="w-3.5 h-3.5 text-[#22c55e]" /> Filter:
        </span>
        {statuses.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilterStatus(s.value)}
            className={`text-xs px-3.5 py-1.5 rounded-xl font-mono font-medium transition cursor-pointer ${
              filterStatus === s.value
                ? "bg-[#22c55e] text-slate-950 font-bold shadow-md shadow-emerald-950/40"
                : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            {s.label}
          </button>
        ))}
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
