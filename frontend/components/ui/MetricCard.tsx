"use client";

import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  unit?: string;
  icon: LucideIcon;
  variant?: "emerald" | "gold" | "forest" | "sage" | "cyan" | "amber" | "rose" | "slate";
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
      case "gold":
      case "amber":
        return {
          bg: "bg-[#C99B43]/15",
          border: "border-[#C99B43]/30",
          text: "text-[#8C6212]",
          glow: "group-hover:border-[#C99B43]",
        };
      case "forest":
        return {
          bg: "bg-[#063B30]/10",
          border: "border-[#063B30]/25",
          text: "text-[#063B30]",
          glow: "group-hover:border-[#063B30]",
        };
      case "sage":
      case "slate":
        return {
          bg: "bg-[#A5BDAA]/25",
          border: "border-[#A5BDAA]/40",
          text: "text-[#38594E]",
          glow: "group-hover:border-[#38594E]",
        };
      case "rose":
        return {
          bg: "bg-rose-500/10",
          border: "border-rose-500/25",
          text: "text-rose-700",
          glow: "group-hover:border-rose-500",
        };
      case "cyan":
      case "emerald":
      default:
        return {
          bg: "bg-[#075442]/10",
          border: "border-[#075442]/20",
          text: "text-[#075442]",
          glow: "group-hover:border-[#075442]",
        };
    }
  };

  const v = getVariantStyles();

  return (
    <div
      className={`ecoroute-card p-5 flex flex-col justify-between group transition-all ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs text-[#63786C] font-semibold uppercase tracking-wider block font-sans">
            {label}
          </span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-[#183B32]`}>
              {value}
            </span>
            {unit && <span className="text-xs text-[#63786C] font-mono">{unit}</span>}
          </div>
        </div>

        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${v.bg} ${v.border} ${v.text}`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>

      {(subValue || trend) && (
        <div className="text-[11px] text-[#63786C] mt-3.5 pt-2.5 border-t border-[#DCCFB5] font-sans flex items-center justify-between">
          <span className="truncate">{subValue}</span>
          {trend && <span className="font-mono text-[#075442] font-bold">{trend}</span>}
        </div>
      )}
    </div>
  );
}
