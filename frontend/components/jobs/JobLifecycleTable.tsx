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
  Play,
  Cpu,
  Zap,
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
      <div className="glass-panel rounded-2xl border border-white/[0.08] p-6 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-slate-900/60 animate-pulse" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="glass-panel p-12 text-center rounded-2xl border border-white/[0.08]">
        <Layers className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-300 font-sans">No Workloads Recorded</h3>
        <p className="text-xs text-slate-400 mt-1 font-sans">
          Submit a new workload profile above to observe real-time spatial carbon routing and execution lifecycle.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 animate-pulse font-mono">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 font-mono">
            <Clock className="w-3.5 h-3.5" /> Scheduled
          </span>
        );
      case "WAITING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">
            <Hourglass className="w-3.5 h-3.5" /> Deferred
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono">
            <AlertCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 font-mono">
            <XCircle className="w-3.5 h-3.5" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 font-mono">
            <Clock className="w-3.5 h-3.5" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl font-sans">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/90 text-slate-400 text-xs uppercase tracking-wider font-mono border-b border-white/[0.06]">
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
          <tbody className="divide-y divide-white/[0.04]">
            {jobs.map((job) => (
              <tr
                key={job.id}
                className="hover:bg-slate-900/40 transition-colors group"
              >
                {/* Workload Name & ID */}
                <td className="px-5 py-4">
                  <div className="font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors font-sans">
                    {job.workload_name}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    UUID: {job.id.substring(0, 8)}... &bull; Pri: {job.priority}
                  </div>
                </td>

                {/* Archetype */}
                <td className="px-4 py-4">
                  <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-800">
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
                    Est: ~{Number(job.base_execution_duration ?? job.estimated_duration_seconds ?? 0)}s
                  </div>
                </td>

                {/* Attempt Budget Progress Bar */}
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
                            : "bg-[#22c55e]"
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
                    <span className="text-amber-400 font-mono text-xs bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      Deferred (Slack)
                    </span>
                  ) : job.assigned_region_code ? (
                    <span className="text-emerald-300 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                      {job.assigned_region_code}
                    </span>
                  ) : job.assigned_region_id ? (
                    <span className="text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Assigned
                    </span>
                  ) : (
                    <span className="text-slate-500 font-mono text-xs">Unassigned</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/decisions?job_id=${job.id}`}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition cursor-pointer"
                      title="Inspect Scheduling Decision & Provenance"
                    >
                      <Cpu className="w-3 h-3 text-[#22c55e]" />
                      Explain <ArrowRight className="w-3 h-3" />
                    </Link>

                    {(job.status === "PENDING" || job.status === "WAITING") && onTriggerScheduling && (
                      <button
                        onClick={() => onTriggerScheduling(job.id)}
                        className="text-xs px-3 py-1 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-slate-950 font-bold transition cursor-pointer shadow-sm shadow-emerald-950/40"
                        title={job.status === "WAITING" ? "Force Evaluation / Dispatch" : "Schedule Workload"}
                      >
                        {job.status === "WAITING" ? "Re-evaluate" : "Schedule"}
                      </button>
                    )}

                    {["PENDING", "WAITING", "SCHEDULED"].includes(job.status) && onCancelJob && (
                      <button
                        onClick={() => onCancelJob(job.id)}
                        className="text-xs px-2 py-1 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 transition cursor-pointer"
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
