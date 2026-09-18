"use client";

import { CarbonQuality, CarbonSource } from "@/lib/types";

interface CarbonBadgeProps {
  intensity: number | string | null | undefined;
  quality?: CarbonQuality | string | null;
  source?: CarbonSource | string | null;
  isEstimated?: boolean;
  estimationMethod?: string | null;
  showSource?: boolean;
}

export function CarbonBadge({
  intensity,
  quality,
  source,
  isEstimated = false,
  estimationMethod,
  showSource = false,
}: CarbonBadgeProps) {
  const numIntensity = intensity != null && intensity !== "" ? Number(intensity) : null;
  const isInvalid = numIntensity === null || isNaN(numIntensity) || !isFinite(numIntensity);

  if (isInvalid || quality === "UNAVAILABLE" || quality === "UNTRUSTED") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900/90 text-slate-400 border border-slate-800 font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        <span>CI: NULL (Unavailable)</span>
        {quality === "UNTRUSTED" && (
          <span className="text-[10px] text-rose-400 uppercase font-bold">[Untrusted]</span>
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
      case "LIVE_ESTIMATED":
        return {
          bg: "bg-teal-500/10",
          border: "border-teal-500/30",
          text: "text-teal-300",
          dot: "bg-teal-400 animate-pulse",
          label: "Live Model",
        };
      case "VALID_CACHE":
      case "CACHE_VALID":
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
          bg: "bg-slate-800/80",
          border: "border-slate-700/80",
          text: "text-slate-300",
          dot: "bg-slate-400",
          label: quality || "Observed",
        };
    }
  };

  const q = getQualityStyles();
  const titleInfo = [
    `Source: ${source || "Electricity Maps"}`,
    `Quality: ${quality || "LIVE"}`,
    isEstimated || quality === "LIVE_ESTIMATED"
      ? `Estimated: Yes (${estimationMethod || "Electricity Maps Live Model"})`
      : "Estimated: No",
  ].join(" | ");

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium border ${q.bg} ${q.border} ${q.text}`}
      title={titleInfo}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${q.dot}`} />
      <span className="font-bold font-mono">
        {numIntensity.toFixed(1)} <span className="text-[10px] font-sans font-normal opacity-80">gCO₂/kWh</span>
      </span>
      <span className="text-[10px] opacity-75 border-l border-current/20 pl-1.5 font-mono">
        {q.label}
      </span>
      {showSource && source && (
        <span className="text-[9px] uppercase tracking-wider opacity-60 font-mono">
          &bull; {String(source).replace("_", " ")}
        </span>
      )}
    </div>
  );
}
