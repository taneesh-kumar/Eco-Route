"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { JobCreatePayload, JobResponse } from "@/lib/types";
import { WorkloadForm } from "@/components/jobs/WorkloadForm";
import { JobLifecycleTable } from "@/components/jobs/JobLifecycleTable";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Layers, Filter, RefreshCw } from "lucide-react";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = async () => {
    try {
      const params = filterStatus === "ALL" ? { limit: 100 } : { status: filterStatus, limit: 100 };
      const jobsRes = await apiClient.getJobs(params);
      setJobs(jobsRes.items || []);
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
    { label: "Deferred", value: "WAITING" },
    { label: "Scheduled", value: "SCHEDULED" },
    { label: "Completed", value: "COMPLETED" },
    { label: "Failed", value: "FAILED" },
  ];

  if (loading) {
    return (
      <LoadingScreen
        message="Loading Workload Telemetry..."
        submessage="Connecting to distributed execution queue and durable state"
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
              Workload Lifecycle Pipeline
            </span>
            <span className="text-[#A5BDAA]">&bull;</span>
            <span className="text-xs text-[#63786C] font-mono">Durable audit record</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#075442]">
            Workload Management
          </h1>
          <p className="text-sm text-[#486256] mt-1.5 max-w-2xl">
            Submit compute demands, configure multi-objective optimization weights ($J_r$), and manage execution lifecycles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setRefreshing(true);
              fetchJobs();
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFF8EB] hover:bg-[#FFFDF8] text-[#183B32] text-xs font-mono font-semibold border border-[#DCCFB5] shadow-xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#075442]" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Intake Form & Pipeline Visualizer */}
      <WorkloadForm onSubmit={handleCreateJob} loading={refreshing} />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-[#DCCFB5]">
        <span className="text-xs text-[#63786C] flex items-center gap-1.5 mr-1 font-mono font-semibold">
          <Filter className="w-3.5 h-3.5 text-[#075442]" /> Filter:
        </span>
        {statuses.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilterStatus(s.value)}
            className={`text-xs px-3.5 py-1.5 rounded-full font-mono font-semibold transition cursor-pointer ${
              filterStatus === s.value
                ? "bg-[#075442] text-[#FFF8EB] shadow-xs"
                : "bg-[#FFF8EB] text-[#486256] hover:text-[#075442] border border-[#DCCFB5]"
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
