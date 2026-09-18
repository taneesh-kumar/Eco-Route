import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats carbon emissions preserving full precision for small non-zero values.
 * Never rounds small non-zero values down to "0.0".
 * Examples:
 * - 0.000048 -> "0.048 mgCO₂eq [ESTIMATED]"
 * - 0.1234 -> "0.1234 gCO₂eq [ESTIMATED]"
 * - 12.5 -> "12.50 gCO₂eq [ESTIMATED]"
 * - 1500 -> "1.500 kgCO₂eq [ESTIMATED]"
 */
export function formatEmissions(
  val: number | string | null | undefined,
  includeUnit = true,
  isEstimated = true
): string {
  if (val === null || val === undefined || val === "") return "N/A";
  const num = Number(val);
  if (isNaN(num)) return "N/A";
  if (num === 0) return includeUnit ? `0.0 gCO₂eq${isEstimated ? " [ESTIMATED]" : ""}` : "0.0";

  const suffix = isEstimated ? " [ESTIMATED]" : "";

  if (num < 0.001 && num > 0) {
    const mg = num * 1000;
    if (mg < 0.01) {
      return `${num.toPrecision(3)} gCO₂eq${suffix}`;
    }
    return `${mg.toFixed(3)} mgCO₂eq${suffix}`;
  }
  if (num < 1.0 && num > 0) {
    return `${num.toFixed(4)} gCO₂eq${suffix}`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(3)} kgCO₂eq${suffix}`;
  }
  return `${num.toFixed(2)} gCO₂eq${suffix}`;
}

/**
 * Formats grid carbon intensity.
 * Never displays NaN, null, or undefined as numeric values.
 */
export function formatCarbonIntensity(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "N/A";
  const num = Number(val);
  if (isNaN(num)) return "N/A";
  return `${num.toFixed(2)} gCO₂eq/kWh`;
}

/**
 * Formats a set of related emission metrics (e.g. Baseline, EcoRoute, Reduction)
 * using the EXACT SAME unit across all values so cards never mix g and mg.
 *
 * Unit selection:
 * - If max value > 0 and max value < 0.01 g (10 mg): all values formatted in mgCO₂eq.
 * - If max value >= 1000 g: all values formatted in kgCO₂eq.
 * - Otherwise: all values formatted in gCO₂eq.
 */
export function formatEmissionsComparison(
  baseline: number | string | null | undefined,
  ecoroute: number | string | null | undefined,
  reduction: number | string | null | undefined,
  isEstimated = true
): {
  baselineFormatted: string;
  ecorouteFormatted: string;
  reductionFormatted: string;
  unit: string;
} {
  const parseVal = (v: number | string | null | undefined): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  const b = parseVal(baseline);
  const e = parseVal(ecoroute);
  const r = parseVal(reduction);

  const nonNulls = [b, e, r].filter((v): v is number => v !== null);
  const maxVal = nonNulls.length > 0 ? Math.max(...nonNulls.map(Math.abs)) : 0;

  const suffix = isEstimated ? " [ESTIMATED]" : "";

  let unit = "gCO₂eq";
  let factor = 1.0;
  let decimals = 4;

  if (maxVal > 0 && maxVal < 0.01) {
    unit = "mgCO₂eq";
    factor = 1000.0;
    decimals = 3;
  } else if (maxVal >= 1000) {
    unit = "kgCO₂eq";
    factor = 0.001;
    decimals = 3;
  } else if (maxVal >= 1.0) {
    unit = "gCO₂eq";
    factor = 1.0;
    decimals = 2;
  } else {
    unit = "gCO₂eq";
    factor = 1.0;
    decimals = 4;
  }

  const formatOne = (val: number | null): string => {
    if (val === null) return "N/A";
    const scaled = val * factor;
    return `${scaled.toFixed(decimals)} ${unit}${suffix}`;
  };

  return {
    baselineFormatted: formatOne(b),
    ecorouteFormatted: formatOne(e),
    reductionFormatted: formatOne(r),
    unit,
  };
}
