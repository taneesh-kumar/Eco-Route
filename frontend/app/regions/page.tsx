"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { CarbonObservationResponse, RegionResponse } from "@/lib/types";
import { RegionGrid } from "@/components/regions/RegionGrid";
import { EarthGlobe } from "@/components/globe/EarthGlobe";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { RefreshCw, ShieldCheck } from "lucide-react";

export default function RegionsPage() {
  const [regions, setRegions] = useState<RegionResponse[]>([]);
  const [carbon, setCarbon] = useState<CarbonObservationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRegionCode, setSelectedRegionCode] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [r, c] = await Promise.all([
        apiClient.getRegions().catch(() => []),
        apiClient.getLatestCarbon().catch(() => []),
      ]);
      setRegions(r);
      setCarbon(c);
      if (r.length > 0 && !selectedRegionCode) {
        setSelectedRegionCode(r[0].code);
      }
    } catch (err) {
      console.error("Failed to load regional data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 12000);
    return () => clearInterval(interval);
  }, []);

  const carbonMap: Record<string, CarbonObservationResponse> = {};
  for (const obs of carbon) {
    carbonMap[obs.region_code] = obs;
  }

  const selectedRegion = regions.find((r) => r.code === selectedRegionCode) || regions[0] || null;
  const selectedObs = selectedRegion ? carbonMap[selectedRegion.code] : null;

  if (loading) {
    return (
      <LoadingScreen
        message="Resolving Global Cloud Topology..."
        submessage="Querying multi-region host capacities and Electricity Maps carbon zones"
      />
    );
  }

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#DCCFB5]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#075442] bg-[#075442]/10 px-2.5 py-0.5 rounded-full border border-[#075442]/20 font-semibold">
              Global Cloud Topology
            </span>
            <span className="text-[#A5BDAA]">&bull;</span>
            <span className="text-xs text-[#63786C] font-mono">
              {regions.length > 0 ? `${regions.length} Active Regions` : "Discovering Topology..."}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#075442]">
            Global Compute Grid
          </h1>
          <p className="text-sm text-[#486256] mt-1.5 max-w-2xl">
            Explore {regions.length > 0 ? `${regions.length}` : "all"} active compute regions, real-time carbon data, hardware capacity, and workload activity.
          </p>
        </div>

        <button
          onClick={() => {
            setRefreshing(true);
            loadData();
          }}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFF8EB] hover:bg-[#FFFDF8] text-[#183B32] text-xs font-mono font-semibold border border-[#DCCFB5] shadow-xs transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#075442] ${refreshing ? "animate-spin" : ""}`} />
          Refresh Topology
        </button>
      </div>

      {/* Primary Split View: Left Region List + Center 3D Earth + Right Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Region Cards List with Mini Sparklines (3 cols) */}
        <div className="lg:col-span-3 space-y-2 max-h-[580px] overflow-y-auto pr-1">
          <div className="text-[11px] font-mono uppercase text-[#63786C] tracking-wider font-bold mb-2">
            Compute Regions ({regions.length})
          </div>

          {regions.map((r: any, idx: number) => {
            const obs = carbonMap[r.code];
            const isSelected = selectedRegionCode === r.code;
            const ci = obs?.carbon_intensity_gco2 != null ? Number(obs.carbon_intensity_gco2) : null;
            const sparklineColor =
              ci === null
                ? "#A5BDAA"
                : ci > 400
                ? "#BE123C"
                : ci > 150
                ? "#C99B43"
                : "#075442";

            const util = Number(r.current_utilization);
            const cVal = ci;

            const sparklinePath = Number.isFinite(cVal) && Number.isFinite(util)
              ? `M 0,${Math.round(20 - util * 12)} L 60,${Math.round(20 - util * 12)}`
              : "";

            return (
              <div
                key={r.code || idx}
                onClick={() => setSelectedRegionCode(r.code)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer font-mono flex items-center justify-between ${
                  isSelected
                    ? "bg-[#FFFDF8] border-[#075442] shadow-sm text-[#075442]"
                    : "bg-[#FFF8EB] border-[#DCCFB5] hover:bg-[#FFFDF8] hover:border-[#075442] text-[#486256]"
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-[#183B32] flex items-center gap-1.5 font-sans">
                    <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-[#075442] animate-pulse" : "bg-[#A5BDAA]"}`} />
                    {r.code}
                  </div>
                  <div className="text-[11px] font-bold mt-0.5" style={{ color: sparklineColor }}>
                    {ci != null ? `${ci.toFixed(0)} gCO₂/kWh` : "Unverified"}
                  </div>
                </div>

                {/* Dynamic SVG Sparkline */}
                <div className="w-16 h-7">
                  <svg className="w-full h-full" viewBox="0 0 60 25">
                    <path
                      d={sparklinePath}
                      fill="none"
                      stroke={sparklineColor}
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>

        {/* Center 3D Earth Globe (6 cols) */}
        <div className="lg:col-span-6 rounded-3xl overflow-hidden border border-[#DCCFB5] shadow-xs relative bg-[#F4E4C4]">
          <EarthGlobe
            regions={regions}
            carbonObservations={carbon}
            selectedRegionCode={selectedRegionCode}
            onSelectRegion={(code) => setSelectedRegionCode(code)}
            globeOffset={[0, 0]}
            height="520px"
          />
        </div>

        {/* Right Region Details Inspector (3 cols) */}
        <div className="lg:col-span-3">
          {selectedRegion ? (
            <div className="ecoroute-card p-5 sm:p-6 shadow-xs space-y-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#63786C] font-semibold">
                  Region Details
                </div>
                <h3 className="text-xl font-bold text-[#075442] mt-0.5">
                  {(selectedRegion as any).city || selectedRegion.name}
                </h3>
                <div className="text-xs font-mono text-[#63786C] mt-0.5">
                  Location: <span className="text-[#183B32] font-semibold">{selectedRegion.country}</span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2 text-xs font-mono ecoroute-badge-emerald px-3 py-1.5 font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#075442] animate-pulse" />
                Status: Operational
              </div>

              {/* Key Metrics */}
              <div className="space-y-3 pt-2 text-xs font-mono border-t border-[#DCCFB5]">
                <div className="flex items-center justify-between">
                  <span className="text-[#63786C]">Carbon Intensity</span>
                  <span className={`font-bold ${
                    selectedObs?.carbon_intensity_gco2 != null
                      ? Number(selectedObs.carbon_intensity_gco2) > 150 ? "text-[#8C6212]" : "text-[#075442]"
                      : "text-[#63786C]"
                  }`}>
                    {selectedObs?.carbon_intensity_gco2 != null
                      ? `${Number(selectedObs.carbon_intensity_gco2).toFixed(1)} gCO₂/kWh`
                      : "Unverified"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#63786C]">Hardware Allocation</span>
                  <span className="text-[#183B32] font-semibold">
                    {Math.round(Number(selectedRegion.current_utilization) * Number(selectedRegion.max_cpu_capacity))} vCPUs ({Math.round(Number(selectedRegion.current_utilization) * 100)}% load)
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#63786C]">Avg. Latency</span>
                  <span className="text-[#183B32] font-semibold">
                    {Number(selectedRegion.network_latency_ms).toFixed(1)} ms
                  </span>
                </div>
              </div>

              {/* Capacity Specs */}
              <div className="p-3.5 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5] space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-[#63786C]">
                  <span>Hardware Capacity:</span>
                  <span className="text-[#183B32] font-semibold">
                    {Number(selectedRegion.max_cpu_capacity)} vCPU / {Number(selectedRegion.max_memory_capacity)} GB
                  </span>
                </div>
                <div className="flex justify-between text-[#63786C]">
                  <span>Power Range:</span>
                  <span className="text-[#183B32] font-semibold">
                    {Number(selectedRegion.idle_power_watts)}W - {Number(selectedRegion.peak_power_watts)}W
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="ecoroute-card p-6 text-center text-xs text-[#63786C] font-mono">
              Select a region to inspect telemetry.
            </div>
          )}
        </div>
      </div>

      {/* Data quality and source banner */}
      <div className="ecoroute-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#075442]/10 border border-[#075442]/20 flex items-center justify-center text-[#075442] shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#075442]">
              Verified Telemetry &amp; Transparent Grid Signals
            </h3>
            <p className="text-xs text-[#63786C] mt-0.5">
              Only verified live telemetry and fresh cache entries qualify as trustworthy. When grid telemetry is unavailable, carbon intensity is strictly set to <span className="font-mono text-[#075442] font-bold">NULL</span>.
            </p>
          </div>
        </div>
        <div className="text-xs font-mono text-[#63786C] shrink-0">
          Source: <span className="text-[#075442] font-bold">Electricity Maps REST API</span>
        </div>
      </div>

      {/* Regional Cards Grid */}
      <RegionGrid
        regions={regions}
        carbonObservations={carbon}
        selectedRegionCode={selectedRegionCode}
        onSelectRegion={(code) => setSelectedRegionCode(code)}
        loading={loading}
      />
    </div>
  );
}
