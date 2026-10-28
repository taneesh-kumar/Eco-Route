"use client";

import { useState, useEffect } from "react";
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
  Globe,
  HelpCircle,
  Info,
  X,
  ShieldCheck,
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
  const [actionInProgress, setActionInProgress] = useState<{
    id: string;
    type: "schedule" | "cancel";
  } | null>(null);
  const [showLifecycleGuide, setShowLifecycleGuide] = useState(false);
  const [inspectJob, setInspectJob] = useState<JobResponse | null>(null);

  // Keyboard Escape listener and scroll locking for modals
  useEffect(() => {
    if (!showLifecycleGuide && !inspectJob) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowLifecycleGuide(false);
        setInspectJob(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [showLifecycleGuide, inspectJob]);

  const handleScheduleClick = async (jobId: string) => {
    if (!onTriggerScheduling || actionInProgress) return;
    setActionInProgress({ id: jobId, type: "schedule" });
    try {
      await onTriggerScheduling(jobId);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancelClick = async (jobId: string) => {
    if (!onCancelJob || actionInProgress) return;
    setActionInProgress({ id: jobId, type: "cancel" });
    try {
      await onCancelJob(jobId);
    } finally {
      setActionInProgress(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono shadow-sm">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 animate-pulse font-mono shadow-sm">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 font-mono shadow-sm">
            <Clock className="w-3.5 h-3.5" /> Scheduled
          </span>
        );
      case "WAITING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono shadow-sm">
            <Hourglass className="w-3.5 h-3.5" /> Deferred
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono shadow-sm">
            <Layers className="w-3.5 h-3.5" /> Queued (Pending)
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono shadow-sm">
            <AlertCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800/90 text-slate-400 border border-slate-700 font-mono">
            <XCircle className="w-3.5 h-3.5" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 font-mono">
            <Clock className="w-3.5 h-3.5" /> {status}
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: number, priorityClass?: string) => {
    if (priorityClass === "HIGH" || priority <= 3) {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
          P{priority} High
        </span>
      );
    }
    if (priorityClass === "LOW" || priority >= 8) {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700">
          P{priority} Low
        </span>
      );
    }
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
        P{priority} Med
      </span>
    );
  };

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl border border-white/[0.08] p-6 space-y-4 font-sans">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div className="h-4 w-32 bg-slate-800 rounded animate-pulse" />
          <div className="h-4 w-24 bg-slate-800 rounded animate-pulse" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl bg-slate-900/60 border border-slate-800/80 p-3 flex items-center justify-between animate-pulse"
          >
            <div className="space-y-1.5 w-1/3">
              <div className="h-4 bg-slate-800 rounded w-3/4" />
              <div className="h-3 bg-slate-800/60 rounded w-1/2" />
            </div>
            <div className="h-6 w-24 bg-slate-800 rounded-full" />
            <div className="h-4 w-20 bg-slate-800 rounded hidden sm:block" />
            <div className="h-8 w-24 bg-slate-800 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="glass-panel p-12 text-center rounded-2xl border border-white/[0.08] space-y-3 font-sans">
        <div className="w-12 h-12 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center text-slate-400 mx-auto">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-200">No Workloads Recorded</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          No workloads match the selected filter. Submit a compute demand using the intake form above to inspect real-time spatial carbon routing and queue status.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl font-sans">
      {/* Lifecycle State Guide Modal */}
      {showLifecycleGuide && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLifecycleGuide(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lifecycle-guide-title"
            className="glass-panel w-full max-w-3xl max-h-[85vh] rounded-2xl border border-white/[0.12] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-slate-950/90 shrink-0">
              <div className="flex items-center gap-2 font-mono text-xs text-slate-200">
                <HelpCircle className="w-4 h-4 text-[#22c55e]" />
                <span id="lifecycle-guide-title" className="font-bold text-sm text-white">
                  Workload Lifecycle &amp; Queue Progression Guide
                </span>
              </div>
              <button
                onClick={() => setShowLifecycleGuide(false)}
                aria-label="Close Lifecycle Guide"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans text-slate-300">
              <p className="text-slate-300 text-xs leading-relaxed">
                EcoRoute tracks compute workloads through a 5-stage lifecycle state machine. Each stage reflects the current workload status in the scheduling and execution pipeline:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-indigo-500/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-indigo-400 font-mono font-bold text-xs">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    1. PENDING (Intake Queue)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Workload record created and validated. It is queued and awaiting multi-region feasibility evaluation by the Decision Engine.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-amber-500/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-400 font-mono font-bold text-xs">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    2. WAITING (Deferred Window)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Optimizer evaluated deferral potential to wait for a forecasted lower-carbon window within deadline slack. Click &quot;Re-evaluate&quot; to test against current grid conditions anytime.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-blue-500/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-blue-400 font-mono font-bold text-xs">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    3. SCHEDULED (Region Locked)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Multi-objective optimization scored candidate regions and selected the target region based on carbon and latency objectives. An execution attempt is prepared for dispatch.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-cyan-500/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-cyan-400 font-mono font-bold text-xs">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    4. RUNNING (Execution Dispatch)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Worker claimed the attempt for execution in the target region with duration, energy, and carbon telemetry tracking.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-emerald-500/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    5. COMPLETED (Durable Finish)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Workload completed successfully. Execution duration, energy consumption (kWh), and carbon emissions are recorded in attempt telemetry.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-rose-500/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-rose-400 font-mono font-bold text-xs">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    FAILED / CANCELLED (Terminal)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    FAILED: Attempt budget was exhausted or execution error occurred. CANCELLED: Manually stopped by user request.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workload Inspection Modal */}
      {inspectJob && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectJob(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspect-job-title"
            className="glass-panel w-full max-w-2xl max-h-[90vh] rounded-2xl border border-white/[0.12] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-slate-950/90 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Cpu className="w-4 h-4 text-[#22c55e] shrink-0" />
                <h3 id="inspect-job-title" className="font-bold text-sm text-white truncate">
                  {inspectJob.workload_name}
                </h3>
                <span className="text-slate-500">&bull;</span>
                <span className="text-[11px] font-mono text-slate-400 truncate">
                  ID: {inspectJob.id}
                </span>
              </div>
              <button
                onClick={() => setInspectJob(null)}
                aria-label="Close Workload Details"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs font-sans">
              {/* Confirmed Status Banner */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                    Current Verified State
                  </span>
                  <div>{getStatusBadge(inspectJob.status)}</div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {inspectJob.status === "PENDING"
                    ? "Workload is queued and awaiting scheduling evaluation by the Decision Engine."
                    : inspectJob.status === "WAITING"
                    ? "Workload is deferred to wait for a forecast window with lower carbon intensity. Deadline slack is currently active."
                    : inspectJob.status === "SCHEDULED"
                    ? `Target region ${inspectJob.assigned_region_code || "assigned"} selected. Execution attempt queued for dispatch.`
                    : inspectJob.status === "RUNNING"
                    ? `Workload is executing in target region ${inspectJob.assigned_region_code || "assigned"}.`
                    : inspectJob.status === "COMPLETED"
                    ? "Execution completed successfully. Duration, energy, and carbon metrics are recorded."
                    : inspectJob.status === "FAILED"
                    ? "Execution failed or retry budget was exhausted."
                    : "Workload was cancelled by user request."}
                </p>
              </div>

              {/* Specifications Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Archetype &amp; Priority</span>
                  <span className="font-bold text-slate-200 mt-1 block">{inspectJob.workload_type}</span>
                  <div className="mt-1">{getPriorityBadge(inspectJob.priority, inspectJob.priority_class)}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Hardware Demand</span>
                  <span className="font-bold text-slate-200 mt-1 block">
                    {Number(inspectJob.cpu_demand)} vCPU &bull; {Number(inspectJob.memory_demand)} GB
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Est: ~{Number(inspectJob.base_execution_duration ?? inspectJob.estimated_duration_seconds ?? 0)}s
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Attempt Budget</span>
                  <span className="font-bold text-slate-200 mt-1 block">
                    {inspectJob.current_attempt_count} / {inspectJob.max_retries} Attempts
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    {inspectJob.status === "COMPLETED"
                      ? `Completed on attempt ${inspectJob.current_attempt_count}`
                      : inspectJob.status === "FAILED"
                      ? inspectJob.current_attempt_count >= inspectJob.max_retries
                        ? "Retry budget exhausted"
                        : "Failed execution"
                      : inspectJob.status === "CANCELLED"
                      ? "Cancelled"
                      : inspectJob.current_attempt_count >= inspectJob.max_retries
                      ? "Final attempt in progress"
                      : `${Math.max(0, inspectJob.max_retries - inspectJob.current_attempt_count)} retries remaining`}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Assigned Region</span>
                  <span className="font-bold text-emerald-400 mt-1 block">
                    {inspectJob.assigned_region_code || (inspectJob.assigned_region_id ? "Region Assigned" : "Unassigned")}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Created At</span>
                  <span className="text-slate-300 mt-1 block text-[11px]">
                    {new Date(inspectJob.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Deadline</span>
                  <span className="text-slate-300 mt-1 block text-[11px]">
                    {new Date(inspectJob.deadline).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={`/decisions?job_id=${inspectJob.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-mono font-semibold transition"
                >
                  <Cpu className="w-3.5 h-3.5 text-[#22c55e]" />
                  <span>Inspect Decision &amp; Score Math</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </Link>

                <div className="flex items-center gap-2">
                  {(inspectJob.status === "PENDING" || inspectJob.status === "WAITING") && onTriggerScheduling && (
                    <button
                      onClick={async () => {
                        const jid = inspectJob.id;
                        setInspectJob(null);
                        await handleScheduleClick(jid);
                      }}
                      className="px-4 py-2 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-slate-950 font-bold text-xs font-sans transition shadow-sm cursor-pointer"
                    >
                      {inspectJob.status === "WAITING" ? "Re-evaluate Now" : "Schedule Now"}
                    </button>
                  )}

                  {["PENDING", "WAITING", "SCHEDULED"].includes(inspectJob.status) && onCancelJob && (
                    <button
                      onClick={async () => {
                        const jid = inspectJob.id;
                        setInspectJob(null);
                        await handleCancelClick(jid);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 text-xs font-sans transition cursor-pointer"
                    >
                      Cancel Workload
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Table Toolbar: Record Count + State Guide Trigger */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-slate-950/80">
        <div className="text-xs font-mono text-slate-300 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-[#22c55e]" />
          <span>Workload Queue</span>
          <span className="text-slate-500">&bull;</span>
          <span className="text-[11px] text-slate-400">{jobs.length} records loaded</span>
        </div>
        <button
          onClick={() => setShowLifecycleGuide(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 text-xs font-mono transition cursor-pointer"
          title="Inspect the 5-stage lifecycle state machine"
        >
          <HelpCircle className="w-3.5 h-3.5 text-[#22c55e]" />
          <span>Lifecycle Guide</span>
        </button>
      </div>

      {/* Desktop Table View (>= 768px) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/90 text-slate-400 text-xs uppercase tracking-wider font-mono border-b border-white/[0.06]">
            <tr>
              <th className="px-5 py-3.5">Workload &amp; Identifier</th>
              <th className="px-4 py-3.5">Type &amp; SLA</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Compute Demand</th>
              <th className="px-4 py-3.5">Attempt Budget</th>
              <th className="px-4 py-3.5">Target Region</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {jobs.map((job) => {
              const isActionRunning = actionInProgress?.id === job.id;
              const isScheduleAction =
                isActionRunning && actionInProgress?.type === "schedule";
              const isCancelAction =
                isActionRunning && actionInProgress?.type === "cancel";
              const durationEst =
                job.base_execution_duration ?? job.estimated_duration_seconds ?? 0;
              const isTerminalExhausted =
                job.status === "FAILED" &&
                job.current_attempt_count >= job.max_retries;
              const isFinalAttemptActive =
                !["COMPLETED", "FAILED", "CANCELLED"].includes(job.status) &&
                job.current_attempt_count >= job.max_retries &&
                job.current_attempt_count > 0;

              return (
                <tr
                  key={job.id}
                  className="hover:bg-slate-900/40 transition-colors group"
                >
                  {/* Workload Name & ID */}
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-100 group-hover:text-emerald-400 transition-colors font-sans text-sm">
                      {job.workload_name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                      <span>ID: {job.id.substring(0, 8)}...</span>
                      <span>&bull;</span>
                      <span>{new Date(job.created_at).toLocaleTimeString()}</span>
                    </div>
                  </td>

                  {/* Archetype & Priority */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-900 text-slate-200 border border-slate-800">
                        {job.workload_type}
                      </span>
                      {getPriorityBadge(job.priority, job.priority_class)}
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="px-4 py-4">{getStatusBadge(job.status)}</td>

                  {/* Demand Specs */}
                  <td className="px-4 py-4 font-mono text-xs text-slate-300">
                    <div className="font-semibold text-slate-200">
                      {Number(job.cpu_demand)} vCPU &bull; {Number(job.memory_demand)} GB RAM
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Est. Duration: ~{Number(durationEst)}s
                    </div>
                  </td>

                  {/* Attempt Budget Progress Bar */}
                  <td className="px-4 py-4 font-mono text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span
                          className={
                            isTerminalExhausted
                              ? "text-rose-400 font-bold"
                              : isFinalAttemptActive
                              ? "text-amber-400 font-medium"
                              : "text-slate-300 font-semibold"
                          }
                        >
                          {job.current_attempt_count} of {job.max_retries} attempts
                          {isTerminalExhausted ? " (exhausted)" : job.status === "COMPLETED" ? " (completed)" : ""}
                        </span>
                      </div>
                      <div className="w-28 bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isTerminalExhausted
                              ? "bg-rose-500"
                              : isFinalAttemptActive
                              ? "bg-amber-500"
                              : "bg-[#22c55e]"
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              (job.current_attempt_count / (job.max_retries || 1)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Region Assigned */}
                  <td className="px-4 py-4 font-mono text-xs">
                    {job.status === "WAITING" ? (
                      <span className="inline-flex items-center gap-1 text-amber-300 font-mono text-xs bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/25">
                        <Hourglass className="w-3 h-3" /> Deferred (Slack)
                      </span>
                    ) : job.assigned_region_code ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-300 font-mono font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                        <Globe className="w-3 h-3 text-[#22c55e]" />
                        {job.assigned_region_code}
                      </span>
                    ) : job.assigned_region_id ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Assigned
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono text-xs">Unassigned</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setInspectJob(job)}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition cursor-pointer font-medium"
                        title="Inspect Full Workload Lifecycle State"
                      >
                        <Info className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Inspect</span>
                      </button>

                      <Link
                        href={`/decisions?job_id=${job.id}`}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition cursor-pointer font-medium"
                        title="Inspect Mathematical Decision Provenance"
                      >
                        <Cpu className="w-3.5 h-3.5 text-[#22c55e]" />
                        <span>Explain</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                      </Link>

                      {(job.status === "PENDING" || job.status === "WAITING") &&
                        onTriggerScheduling && (
                          <button
                            onClick={() => handleScheduleClick(job.id)}
                            disabled={isActionRunning}
                            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-slate-950 font-bold transition cursor-pointer shadow-sm shadow-emerald-950/40"
                            title={
                              job.status === "WAITING"
                                ? "Re-evaluate Workload Against Current Grid"
                                : "Dispatch Workload Now"
                            }
                          >
                            {isScheduleAction ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Evaluating...</span>
                              </>
                            ) : job.status === "WAITING" ? (
                              "Re-evaluate"
                            ) : (
                              "Schedule"
                            )}
                          </button>
                        )}

                      {["PENDING", "WAITING", "SCHEDULED"].includes(job.status) &&
                        onCancelJob && (
                          <button
                            onClick={() => handleCancelClick(job.id)}
                            disabled={isActionRunning}
                            className="text-xs px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 transition cursor-pointer disabled:opacity-50"
                            title="Cancel Workload"
                          >
                            {isCancelAction ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-rose-400" />
                            ) : (
                              "Cancel"
                            )}
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Layout (< 768px) */}
      <div className="md:hidden divide-y divide-white/[0.06]">
        {jobs.map((job) => {
          const isActionRunning = actionInProgress?.id === job.id;
          const isScheduleAction =
            isActionRunning && actionInProgress?.type === "schedule";
          const isCancelAction =
            isActionRunning && actionInProgress?.type === "cancel";
          const durationEst =
            job.base_execution_duration ?? job.estimated_duration_seconds ?? 0;
          const isTerminalExhausted =
            job.status === "FAILED" &&
            job.current_attempt_count >= job.max_retries;
          const isFinalAttemptActive =
            !["COMPLETED", "FAILED", "CANCELLED"].includes(job.status) &&
            job.current_attempt_count >= job.max_retries &&
            job.current_attempt_count > 0;

          return (
            <div key={job.id} className="p-4 space-y-3">
              {/* Card Header: Name, ID & Status Badge */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-100 text-sm font-sans">
                    {job.workload_name}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    ID: {job.id.substring(0, 8)}... &bull;{" "}
                    {new Date(job.created_at).toLocaleTimeString()}
                  </div>
                </div>
                <div>{getStatusBadge(job.status)}</div>
              </div>

              {/* Grid: Type, Demand, Target, Budget */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                    Type &amp; Priority
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="font-bold text-slate-200">
                      {job.workload_type}
                    </span>
                    {getPriorityBadge(job.priority, job.priority_class)}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                    Compute Demand
                  </span>
                  <span className="font-bold text-slate-200 block mt-1">
                    {job.cpu_demand}C / {job.memory_demand}GB
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Est: ~{durationEst}s
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                    Assigned Region
                  </span>
                  <div className="mt-1">
                    {job.status === "WAITING" ? (
                      <span className="text-amber-300 font-bold text-xs">
                        Deferred (Slack)
                      </span>
                    ) : job.assigned_region_code ? (
                      <span className="text-[#22c55e] font-bold text-xs flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {job.assigned_region_code}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">Unassigned</span>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                    Attempt Budget
                  </span>
                  <span
                    className={`font-bold text-xs block mt-1 ${
                      isTerminalExhausted
                        ? "text-rose-400"
                        : isFinalAttemptActive
                        ? "text-amber-400"
                        : "text-slate-200"
                    }`}
                  >
                    {job.current_attempt_count} / {job.max_retries} attempts
                    {isTerminalExhausted ? " (exhausted)" : job.status === "COMPLETED" ? " (completed)" : ""}
                  </span>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
                <button
                  onClick={() => setInspectJob(job)}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-xs py-2 px-3 rounded-xl bg-slate-900/90 text-slate-300 border border-slate-700/80 font-medium"
                >
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Inspect</span>
                </button>

                <Link
                  href={`/decisions?job_id=${job.id}`}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-xs py-2 px-3 rounded-xl bg-slate-900/90 text-slate-200 border border-slate-700/80 font-medium"
                >
                  <Cpu className="w-3.5 h-3.5 text-[#22c55e]" />
                  <span>Explain</span>
                </Link>

                {(job.status === "PENDING" || job.status === "WAITING") &&
                  onTriggerScheduling && (
                    <button
                      onClick={() => handleScheduleClick(job.id)}
                      disabled={isActionRunning}
                      className="flex-1 py-2 px-3 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1"
                    >
                      {isScheduleAction ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Evaluating...</span>
                        </>
                      ) : job.status === "WAITING" ? (
                        "Re-evaluate"
                      ) : (
                        "Schedule"
                      )}
                    </button>
                  )}

                {["PENDING", "WAITING", "SCHEDULED"].includes(job.status) &&
                  onCancelJob && (
                    <button
                      onClick={() => handleCancelClick(job.id)}
                      disabled={isActionRunning}
                      className="py-2 px-3 rounded-xl bg-slate-900 text-slate-400 hover:text-rose-300 border border-slate-800 text-xs font-medium"
                    >
                      {isCancelAction ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-rose-400" />
                      ) : (
                        "Cancel"
                      )}
                    </button>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
