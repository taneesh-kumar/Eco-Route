"use client";

import Link from "next/link";
import { JobResponse } from "@/lib/types";
import {
  Layers,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Hourglass,
  RefreshCw,
  XCircle,
} from "lucide-react";

interface JobLifecycleTableProps {
  jobs: JobResponse[];
  onTriggerScheduling?: (jobId: string) => Promise<void>;
  onCancelJob?: (jobId: string) => Promise<void>;
  loading?: boolean;
}

export function JobLifecycleTable({
  jobs,
  onTriggerScheduling,
  onCancelJob,
  loading = false,
}: JobLifecycleTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl bg-[#0e1424] border border-slate-800/80 p-6">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-900/60 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="p-12 text-center rounded-xl bg-[#0e1424] border border-slate-800/80">
        <Layers className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-300">No Workloads Recorded</h3>
        <p className="text-sm text-slate-400 mt-1">
          Submit a new workload profile above to observe carbon-aware scheduling and execution.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <Clock className="w-3.5 h-3.5" /> Scheduled
          </span>
        );
      case "WAITING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Hourglass className="w-3.5 h-3.5" /> Deferred (Waiting)
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <XCircle className="w-3.5 h-3.5" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <Clock className="w-3.5 h-3.5" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl bg-[#0e1424] border border-slate-800/80 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase tracking-wider font-mono border-b border-slate-800/80">
            <tr>
              <th className="px-5 py-3.5">Workload Name</th>
              <th className="px-4 py-3.5">Type</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Demand Specs</th>
              <th className="px-4 py-3.5">Attempt Budget</th>
              <th className="px-4 py-3.5">Region Assigned</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {jobs.map((job) => (
              <tr
                key={job.id}
                className="hover:bg-slate-900/40 transition-colors group"
              >
                {/* Workload Name */}
                <td className="px-5 py-4">
                  <div className="font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                    {job.workload_name}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    ID: {job.id.substring(0, 8)}... &bull; Pri: {job.priority}
                  </div>
                </td>

                {/* Type */}
                <td className="px-4 py-4">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {job.workload_type}
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-4">{getStatusBadge(job.status)}</td>

                {/* Demand Specs */}
                <td className="px-4 py-4 font-mono text-xs text-slate-300">
                  <div>
                    {Number(job.cpu_demand)} vCPU &bull; {Number(job.memory_demand)} GB
                  </div>
                  <div className="text-[11px] text-slate-400">
                    ~{Number(job.base_execution_duration ?? job.estimated_duration_seconds ?? 0)}s
                  </div>
                </td>

                {/* Attempt Budget */}
                <td className="px-4 py-4 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        job.current_attempt_count >= job.max_retries
                          ? "text-rose-400 font-semibold"
                          : "text-slate-300"
                      }
                    >
                      {job.current_attempt_count} / {job.max_retries}
                    </span>
                    <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          job.current_attempt_count >= job.max_retries
                            ? "bg-rose-500"
                            : "bg-emerald-500"
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            (job.current_attempt_count / job.max_retries) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>

                {/* Region Assigned */}
                <td className="px-4 py-4 font-mono text-xs">
                  {job.assigned_region_id ? (
                    <span className="text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Assigned
                    </span>
                  ) : (
                    <span className="text-slate-400">Unassigned</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/decisions?job_id=${job.id}`}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      title="Inspect Scheduling Rationale"
                    >
                      Explain <ArrowRight className="w-3 h-3" />
                    </Link>

                    {(job.status === "PENDING" || job.status === "WAITING") && onTriggerScheduling && (
                      <button
                        onClick={() => onTriggerScheduling(job.id)}
                        className="text-xs px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                        title={job.status === "WAITING" ? "Force Evaluation / Dispatch" : "Schedule Workload"}
                      >
                        {job.status === "WAITING" ? "Re-evaluate" : "Schedule"}
                      </button>
                    )}

                    {["PENDING", "WAITING", "SCHEDULED"].includes(job.status) &&
                      onCancelJob && (
                        <button
                          onClick={() => onCancelJob(job.id)}
                          className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
