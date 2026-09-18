"use client";

import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  unit?: string;
  icon: LucideIcon;
  variant?: "emerald" | "cyan" | "amber" | "rose" | "slate";
  trend?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  subValue,
  unit,
  icon: Icon,
  variant = "emerald",
  trend,
  className = "",
}: MetricCardProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case "emerald":
        return {
          bg: "bg-[#22c55e]/10",
          border: "border-[#22c55e]/30",
          text: "text-[#22c55e]",
          glow: "group-hover:border-[#22c55e]/60",
        };
      case "cyan":
        return {
          bg: "bg-cyan-500/10",
          border: "border-cyan-500/20",
          text: "text-cyan-400",
          glow: "group-hover:border-cyan-500/40",
        };
      case "amber":
        return {
          bg: "bg-amber-500/10",
          border: "border-amber-500/20",
          text: "text-amber-400",
          glow: "group-hover:border-amber-500/40",
        };
      case "rose":
        return {
          bg: "bg-rose-500/10",
          border: "border-rose-500/20",
          text: "text-rose-400",
          glow: "group-hover:border-rose-500/40",
        };
      default:
        return {
          bg: "bg-slate-800/60",
          border: "border-slate-700/60",
          text: "text-slate-300",
          glow: "group-hover:border-slate-600",
        };
    }
  };

  const v = getVariantStyles();

  return (
    <div
      className={`glass-panel-interactive p-5 rounded-2xl flex flex-col justify-between group ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs text-slate-400 font-medium font-sans block">{label}</span>
          <div className="flex items-baseline gap-1 mt-1.5">
            <span className={`text-xl sm:text-2xl font-extrabold font-mono tracking-tight ${v.text}`}>
              {value}
            </span>
            {unit && <span className="text-xs text-slate-400 font-mono">{unit}</span>}
          </div>
        </div>

        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${v.bg} ${v.border} ${v.text}`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>

      {(subValue || trend) && (
        <div className="text-[11px] text-slate-400 mt-3 pt-2.5 border-t border-white/[0.06] font-sans flex items-center justify-between">
          <span className="truncate">{subValue}</span>
          {trend && <span className="font-mono text-[#22c55e] font-bold">{trend}</span>}
        </div>
      )}
    </div>
  );
}
