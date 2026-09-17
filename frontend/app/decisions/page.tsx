"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { SchedulingDecisionResponse } from "@/lib/types";
import { DecisionExplainer } from "@/components/decisions/DecisionExplainer";
import { Cpu, RefreshCw, Layers } from "lucide-react";

function DecisionsContent() {
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get("job_id");

  const [recentDecisions, setRecentDecisions] = useState<SchedulingDecisionResponse[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<SchedulingDecisionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchJobId, setSearchJobId] = useState(initialJobId || "");

  const fetchFullDecision = async (decisionId: string) => {
    try {
      setLoading(true);
      const full = await apiClient.getDecision(decisionId);
      setSelectedDecision(full);
    } catch (err) {
      console.error("Failed to load full decision details:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentDecisions = async () => {
    try {
      const decisions = await apiClient.getRecentDecisions(20);
      setRecentDecisions(decisions);

      let targetId: string | null = null;
      if (initialJobId) {
        const found = decisions.find((d) => d.job_id === initialJobId);
        if (found) {
          targetId = found.id;
        } else {
          const jobDecisions = await apiClient.getJobDecisions(initialJobId);
          if (jobDecisions.length > 0) {
            targetId = jobDecisions[0].id;
          } else if (decisions.length > 0) {
            targetId = decisions[0].id;
          }
        }
      } else if (decisions.length > 0) {
        targetId = decisions[0].id;
      }

      if (targetId) {
        const full = await apiClient.getDecision(targetId);
        setSelectedDecision(full);
      }
    } catch (err) {
      console.error("Failed to load scheduling decisions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecentDecisions();
  }, [initialJobId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchJobId.trim()) return;
    try {
      setLoading(true);
      const results = await apiClient.getJobDecisions(searchJobId.trim());
      if (results.length > 0) {
        const full = await apiClient.getDecision(results[0].id);
        setSelectedDecision(full);
      }
    } catch (err) {
      console.error("No decision found for job:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Cpu className="w-6 h-6 text-emerald-400" /> Decision Explainability Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Auditable mathematical decomposition: candidate region ranking, multi-objective subscores, and zero-carbon provenance.
          </p>
        </div>

        <button
          onClick={loadRecentDecisions}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Decisions
        </button>
      </div>

      {/* Decision Selection Bar */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between p-4 rounded-xl bg-[#0e1424] border border-slate-800/80">
        {/* Search by Job ID */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search by Job UUID..."
            value={searchJobId}
            onChange={(e) => setSearchJobId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono w-64 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer"
          >
            Find
          </button>
        </form>

        {/* Recent Decisions Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-2xl">
          <span className="text-xs text-slate-400 shrink-0">Recent:</span>
          {recentDecisions.slice(0, 6).map((d) => (
            <button
              key={d.id}
              onClick={() => fetchFullDecision(d.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono transition shrink-0 cursor-pointer ${
                selectedDecision?.id === d.id
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-semibold"
                  : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {d.action} &bull; {d.selected_region_code || "None"} ({d.id.substring(0, 6)})
            </button>
          ))}
        </div>
      </div>

      {/* Main Explainability Visualizer */}
      <DecisionExplainer decision={selectedDecision} loading={loading} />

      {/* Mathematical Formulation Appendix */}
      <div className="p-6 rounded-xl bg-[#0e1424] border border-slate-800/80 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" /> Mathematical Formulation & Normalization Contract
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-slate-300">
          <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-emerald-400 font-semibold block mb-1">1. Composite Score (C)</span>
            <p className="text-slate-400 font-sans text-xs">
              C = w_carbon &times; S_carbon + w_cost &times; S_cost + w_latency &times; S_latency. Lowest score ranks #1.
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-amber-400 font-semibold block mb-1">2. Min-Max Normalization</span>
            <p className="text-slate-400 font-sans text-xs">
              norm(x) = (x - min) / (max - min). If max == min, norm(x) = 0.0 deterministically.
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-cyan-400 font-semibold block mb-1">3. Zero Carbon Fabrication</span>
            <p className="text-slate-400 font-sans text-xs">
              If carbon data is untrusted or unavailable, fallback renormalizes w_cost &amp; w_latency; emissions recorded as NULL.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DecisionsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-slate-400 animate-pulse">
          Loading decision explainer...
        </div>
      }
    >
      <DecisionsContent />
    </Suspense>
  );
}
