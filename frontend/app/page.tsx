"use client";

import { useEffect, useState } from "react";
import { apiClient, HealthResponse } from "@/lib/api-client";

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getHealth();
      setHealth(data);
      setLastChecked(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect to FastAPI backend");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
      case "healthy":
      case "alive":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800">Operational</span>;
      case "unconfigured":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800">Unconfigured</span>;
      case "unavailable":
      case "unhealthy":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-950/80 text-rose-400 border border-rose-800">Unavailable</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">System Infrastructure Foundation</h1>
          <p className="text-sm text-slate-400 mt-1">
            Technical baseline verification for Next.js, FastAPI, PostgreSQL (Supabase), and Redis.
          </p>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-sm font-medium rounded transition shadow-sm cursor-pointer"
        >
          {loading ? "Checking..." : "Re-check Health"}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-sm">
          <p className="font-semibold">Backend Connection Failed</p>
          <p className="mt-1">{error}</p>
          <p className="text-xs text-rose-400 mt-2">
            Make sure the FastAPI backend is running at <code className="bg-slate-900 px-1 py-0.5 rounded">{apiClient.getBaseUrl()}</code>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Backend API Box */}
        <div className="p-5 rounded-lg bg-[#111827] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">FastAPI Backend</span>
            {health ? getStatusBadge(health.components.api.status) : (loading ? <span className="text-xs text-slate-500">Checking...</span> : getStatusBadge("unavailable"))}
          </div>
          <div className="text-lg font-semibold text-white">Application API</div>
          <p className="text-xs text-slate-400">
            {health?.components.api.message || "FastAPI REST API layer"}
          </p>
        </div>

        {/* PostgreSQL Box */}
        <div className="p-5 rounded-lg bg-[#111827] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">PostgreSQL</span>
            {health ? getStatusBadge(health.components.database.status) : (loading ? <span className="text-xs text-slate-500">Checking...</span> : getStatusBadge("unavailable"))}
          </div>
          <div className="text-lg font-semibold text-white">Database Store</div>
          <p className="text-xs text-slate-400">
            {health?.components.database.message || "Supabase PostgreSQL via asyncpg"}
          </p>
        </div>

        {/* Redis Box */}
        <div className="p-5 rounded-lg bg-[#111827] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Redis</span>
            {health ? getStatusBadge(health.components.redis.status) : (loading ? <span className="text-xs text-slate-500">Checking...</span> : getStatusBadge("unavailable"))}
          </div>
          <div className="text-lg font-semibold text-white">Cache & Locks</div>
          <p className="text-xs text-slate-400">
            {health?.components.redis.message || "Redis operational infrastructure"}
          </p>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <span className="font-semibold text-slate-300">Environment:</span>{" "}
          <code className="text-emerald-400">{health?.environment || "unknown"}</code>
          {" "}&bull;{" "}
          <span className="font-semibold text-slate-300">Overall Status:</span>{" "}
          <span className={health?.status === "healthy" ? "text-emerald-400" : "text-amber-400"}>
            {health?.status || "disconnected"}
          </span>
        </div>
        <div>
          {lastChecked && (
            <span>Last verified: {lastChecked.toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
