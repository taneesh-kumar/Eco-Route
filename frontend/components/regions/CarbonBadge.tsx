"use client";

import { CarbonQuality, CarbonSource } from "@/lib/types";

interface CarbonBadgeProps {
  intensity: number | null;
  quality?: CarbonQuality | null;
  source?: CarbonSource | null;
  showSource?: boolean;
}

export function CarbonBadge({
  intensity,
  quality,
  source,
  showSource = false,
}: CarbonBadgeProps) {
  if (intensity === null || quality === "UNAVAILABLE" || quality === "UNTRUSTED") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800/80 text-slate-400 border border-slate-700/80">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        <span>CI: NULL (Unavailable)</span>
        {quality === "UNTRUSTED" && (
          <span className="text-[10px] text-rose-400 uppercase font-mono">[Untrusted]</span>
        )}
      </div>
    );
  }

  const getQualityStyles = () => {
    switch (quality) {
      case "LIVE":
        return {
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/30",
          text: "text-emerald-400",
          dot: "bg-emerald-400 animate-pulse",
          label: "Live Grid",
        };
      case "VALID_CACHE":
        return {
          bg: "bg-cyan-500/10",
          border: "border-cyan-500/30",
          text: "text-cyan-400",
          dot: "bg-cyan-400",
          label: "Cached",
        };
      case "FALLBACK_CACHE":
        return {
          bg: "bg-amber-500/10",
          border: "border-amber-500/30",
          text: "text-amber-400",
          dot: "bg-amber-400",
          label: "Fallback Cache",
        };
      default:
        return {
          bg: "bg-slate-800",
          border: "border-slate-700",
          text: "text-slate-300",
          dot: "bg-slate-400",
          label: quality || "Unknown",
        };
    }
  };

  const q = getQualityStyles();

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium border ${q.bg} ${q.border} ${q.text}`}
      title={`Source: ${source || "None"} | Quality: ${quality || "Unknown"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${q.dot}`} />
      <span className="font-semibold font-mono">
        {Number(intensity).toFixed(1)} <span className="text-[10px] font-sans font-normal opacity-80">gCO₂/kWh</span>
      </span>
      <span className="text-[10px] opacity-75 border-l border-current/20 pl-1.5 font-mono">
        {q.label}
      </span>
      {showSource && source && (
        <span className="text-[9px] uppercase tracking-wider opacity-60 font-mono">
          &bull; {source.replace("_", " ")}
        </span>
      )}
    </div>
  );
}
