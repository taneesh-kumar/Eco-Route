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
  Cpu,
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
      <div className="ecoroute-card p-6 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-[#F4E4C4]/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="ecoroute-card p-12 text-center">
        <Layers className="w-10 h-10 text-[#A5BDAA] mx-auto mb-3" />
        <h3 className="text-base font-bold text-[#183B32] font-sans">No Workloads Recorded</h3>
        <p className="text-xs text-[#63786C] mt-1 max-w-sm mx-auto font-sans">
          Submit a new workload profile above to observe real-time spatial carbon routing and execution lifecycle.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ecoroute-badge-emerald font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ecoroute-badge-emerald animate-pulse font-mono">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ecoroute-badge-sage font-mono">
            <Clock className="w-3.5 h-3.5" /> Scheduled
          </span>
        );
      case "WAITING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ecoroute-badge-gold font-mono">
            <Hourglass className="w-3.5 h-3.5" /> Deferred
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 font-mono">
            <AlertCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EADBCE] text-[#63786C] border border-[#DCCFB5] font-mono">
            <XCircle className="w-3.5 h-3.5" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFFDF8] text-[#183B32] border border-[#DCCFB5] font-mono">
            <Clock className="w-3.5 h-3.5" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="ecoroute-card overflow-hidden shadow-xs font-sans">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-5 py-3.5">Workload</th>
              <th className="px-4 py-3.5">Type</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Compute Demand</th>
              <th className="px-4 py-3.5">Attempt Budget</th>
              <th className="px-4 py-3.5">Target Region</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EADBCE]">
            {jobs.map((job) => (
              <tr
                key={job.id}
                className="hover:bg-[#F8EEDC] transition-colors group"
              >
                {/* Workload Name & ID */}
                <td className="px-5 py-4">
                  <div className="font-bold text-[#183B32] group-hover:text-[#075442] transition-colors font-sans">
                    {job.workload_name}
                  </div>
                  <div className="text-[11px] text-[#63786C] font-mono mt-0.5">
                    UUID: {job.id.substring(0, 8)}... &bull; Pri: {job.priority}
                  </div>
                </td>

                {/* Archetype */}
                <td className="px-4 py-4">
                  <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[#FFFDF8] text-[#486256] border border-[#DCCFB5]">
                    {job.workload_type}
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-4">{getStatusBadge(job.status)}</td>

                {/* Demand Specs */}
                <td className="px-4 py-4 font-mono text-xs text-[#183B32]">
                  <div>
                    {Number(job.cpu_demand)} vCPU &bull; {Number(job.memory_demand)} GB
                  </div>
                  <div className="text-[11px] text-[#63786C]">
                    Est: ~{Number(job.base_execution_duration ?? job.estimated_duration_seconds ?? 0)}s
                  </div>
                </td>

                {/* Attempt Budget Progress Bar */}
                <td className="px-4 py-4 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        job.current_attempt_count >= job.max_retries
                          ? "text-rose-700 font-semibold"
                          : "text-[#183B32]"
                      }
                    >
                      {job.current_attempt_count} / {job.max_retries}
                    </span>
                    <div className="w-12 bg-[#EADBCE] h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          job.current_attempt_count >= job.max_retries
                            ? "bg-rose-500"
                            : "bg-[#075442]"
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
                  {job.status === "WAITING" ? (
                    <span className="text-[#8C6212] font-mono text-xs ecoroute-badge-gold px-2 py-0.5">
                      Deferred (Slack)
                    </span>
                  ) : job.assigned_region_code ? (
                    <span className="text-[#075442] font-mono font-bold ecoroute-badge-emerald px-2 py-0.5">
                      {job.assigned_region_code}
                    </span>
                  ) : job.assigned_region_id ? (
                    <span className="text-[#075442] font-mono ecoroute-badge-emerald px-2 py-0.5">
                      Assigned
                    </span>
                  ) : (
                    <span className="text-[#8EA396] font-mono text-xs">Unassigned</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/decisions?job_id=${job.id}`}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl bg-[#FFF8EB] hover:bg-[#FFFDF8] text-[#075442] border border-[#DCCFB5] font-semibold transition cursor-pointer"
                      title="Inspect Scheduling Decision & Provenance"
                    >
                      <Cpu className="w-3 h-3 text-[#075442]" />
                      Explain <ArrowRight className="w-3 h-3" />
                    </Link>

                    {(job.status === "PENDING" || job.status === "WAITING") && onTriggerScheduling && (
                      <button
                        onClick={() => onTriggerScheduling(job.id)}
                        className="text-xs px-3 py-1.5 rounded-xl bg-[#075442] hover:bg-[#063B30] text-[#FFF8EB] font-bold transition cursor-pointer shadow-xs"
                        title={job.status === "WAITING" ? "Force Evaluation / Dispatch" : "Schedule Workload"}
                      >
                        {job.status === "WAITING" ? "Re-evaluate" : "Schedule"}
                      </button>
                    )}

                    {["PENDING", "WAITING", "SCHEDULED"].includes(job.status) && onCancelJob && (
                      <button
                        onClick={() => onCancelJob(job.id)}
                        className="text-xs px-2 py-1.5 rounded-xl bg-[#FFF8EB] hover:bg-rose-50 text-[#63786C] hover:text-rose-700 border border-[#DCCFB5] transition cursor-pointer"
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
