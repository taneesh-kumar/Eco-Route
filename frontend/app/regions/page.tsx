"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { CarbonObservationResponse, RegionResponse } from "@/lib/types";
import { RegionGrid } from "@/components/regions/RegionGrid";
import { Globe, RefreshCw, Server, Leaf, ShieldCheck } from "lucide-react";

export default function RegionsPage() {
  const [regions, setRegions] = useState<RegionResponse[]>([]);
  const [carbon, setCarbon] = useState<CarbonObservationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [r, c] = await Promise.all([
        apiClient.getRegions().catch(() => []),
        apiClient.getLatestCarbon().catch(() => []),
      ]);
      setRegions(r);
      setCarbon(c);
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Globe className="w-6 h-6 text-emerald-400" /> Regional Infrastructure &amp; Carbon Grid
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Global compute targets, hardware capacity utilization, and verified Electricity Maps telemetry.
          </p>
        </div>

        <button
          onClick={() => {
            setRefreshing(true);
            loadData();
          }}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Topology
        </button>
      </div>

      {/* Zero Carbon Fabrication Guarantee Banner */}
      <div className="p-5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Zero Data Fabrication Policy Enforced
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Only verified live telemetry and fresh cache entries qualify as trustworthy. When grid telemetry is unavailable, carbon intensity is strictly set to <span className="font-mono text-emerald-400">NULL</span>.
            </p>
          </div>
        </div>
        <div className="text-xs font-mono text-slate-400 shrink-0">
          Source: <span className="text-emerald-400">Electricity Maps REST API</span>
        </div>
      </div>

      {/* Regional Cards Grid */}
      <RegionGrid
        regions={regions}
        carbonObservations={carbon}
        loading={loading}
      />
    </div>
  );
}
