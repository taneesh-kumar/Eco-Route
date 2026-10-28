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
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#FFF8EB] text-[#63786C] border border-[#DCCFB5] font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-[#A5BDAA]" />
        <span>CI: NULL (Unavailable)</span>
        {quality === "UNTRUSTED" && (
          <span className="text-[10px] text-rose-700 uppercase font-bold">[Untrusted]</span>
        )}
      </div>
    );
  }

  const getQualityStyles = () => {
    switch (quality) {
      case "LIVE":
        return {
          bg: "bg-[#075442]/10",
          border: "border-[#075442]/30",
          text: "text-[#075442]",
          dot: "bg-[#075442] animate-pulse",
          label: "Live Grid",
        };
      case "LIVE_ESTIMATED":
        return {
          bg: "bg-[#A5BDAA]/20",
          border: "border-[#A5BDAA]/40",
          text: "text-[#38594E]",
          dot: "bg-[#38594E] animate-pulse",
          label: "Live Model",
        };
      case "VALID_CACHE":
      case "CACHE_VALID":
        return {
          bg: "bg-[#C99B43]/15",
          border: "border-[#C99B43]/30",
          text: "text-[#8C6212]",
          dot: "bg-[#C99B43]",
          label: "Cached",
        };
      case "FALLBACK_CACHE":
        return {
          bg: "bg-[#C99B43]/20",
          border: "border-[#C99B43]/40",
          text: "text-[#8C6212]",
          dot: "bg-[#C99B43]",
          label: "Fallback Cache",
        };
      default:
        return {
          bg: "bg-[#FFF8EB]",
          border: "border-[#DCCFB5]",
          text: "text-[#183B32]",
          dot: "bg-[#A5BDAA]",
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
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${q.bg} ${q.border} ${q.text}`}
      title={titleInfo}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${q.dot}`} />
      <span className="font-bold font-mono">
        {numIntensity.toFixed(1)} <span className="text-[10px] font-sans font-normal opacity-85">gCO₂/kWh</span>
      </span>
      <span className="text-[10px] opacity-80 border-l border-current/25 pl-1.5 font-mono">
        {q.label}
      </span>
      {showSource && source && (
        <span className="text-[9px] uppercase tracking-wider opacity-70 font-mono">
          &bull; {String(source).replace("_", " ")}
        </span>
      )}
    </div>
  );
}
