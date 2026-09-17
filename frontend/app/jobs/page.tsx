"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { JobCreatePayload, JobResponse } from "@/lib/types";
import { WorkloadForm } from "@/components/jobs/WorkloadForm";
import { JobLifecycleTable } from "@/components/jobs/JobLifecycleTable";
import { Layers, Filter, RefreshCw } from "lucide-react";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = async () => {
    try {
      const params = filterStatus === "ALL" ? { limit: 100 } : { status: filterStatus, limit: 100 };
      const res = await apiClient.getJobs(params);
      setJobs(res.items || []);
    } catch (err) {
      console.error("Failed to load jobs:", err);
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
    { label: "Deferred (Waiting)", value: "WAITING" },
    { label: "Scheduled", value: "SCHEDULED" },
    { label: "Completed", value: "COMPLETED" },
    { label: "Failed", value: "FAILED" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-emerald-400" /> Workload Lifecycle Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Submit compute demands, monitor execution progress, and track retry budgets across multi-region clusters.
          </p>
        </div>

        <button
          onClick={() => {
            setRefreshing(true);
            fetchJobs();
          }}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Intake Form */}
      <WorkloadForm onSubmit={handleCreateJob} loading={refreshing} />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
          <Filter className="w-3.5 h-3.5" /> Filter:
        </span>
        {statuses.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilterStatus(s.value)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              filterStatus === s.value
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
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
