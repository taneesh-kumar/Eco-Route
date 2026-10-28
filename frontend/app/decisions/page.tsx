"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { SchedulingDecisionResponse } from "@/lib/types";
import { DecisionExplainer } from "@/components/decisions/DecisionExplainer";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { RefreshCw, BookOpen, Search } from "lucide-react";

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

  if (loading && !selectedDecision) {
    return (
      <LoadingScreen
        message="Loading Scheduling Decisions..."
        submessage="Querying algorithmic decision provenance, candidate rankings, and subscore decomposition"
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
              Mathematical Provenance
            </span>
            <span className="text-[#A5BDAA]">&bull;</span>
            <span className="text-xs text-[#63786C] font-mono">Auditable placement decision</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#075442]">
            Scheduling Decisions
          </h1>
          <p className="text-sm text-[#486256] mt-1.5 max-w-2xl font-sans">
            Auditable mathematical decomposition: candidate region ranking, multi-objective subscores ($J_r$), Electricity Maps provenance, and counterfactual emissions reduction.
          </p>
        </div>

        <button
          onClick={loadRecentDecisions}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFF8EB] hover:bg-[#FFFDF8] text-[#183B32] text-xs font-mono font-semibold border border-[#DCCFB5] shadow-xs transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#075442]" />
          Refresh Decisions
        </button>
      </div>

      {/* Decision Selection Bar */}
      <div className="ecoroute-card flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between p-4 sm:p-5 shadow-xs">
        {/* Search by Job UUID */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#63786C] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Job UUID..."
              value={searchJobId}
              onChange={(e) => setSearchJobId(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5] text-[#183B32] text-xs font-mono w-64 focus:outline-none focus:border-[#075442] transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#075442] hover:bg-[#063B30] text-[#FFF8EB] text-xs font-mono font-bold transition cursor-pointer shadow-xs"
          >
            Find
          </button>
        </form>

        {/* Recent Decisions Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-2xl">
          <span className="text-xs text-[#63786C] font-mono shrink-0 font-semibold">Recent:</span>
          {recentDecisions.slice(0, 6).map((d) => (
            <button
              key={d.id}
              onClick={() => fetchFullDecision(d.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-mono transition shrink-0 cursor-pointer ${
                selectedDecision?.id === d.id
                  ? "bg-[#075442] text-[#FFF8EB] font-bold shadow-xs"
                  : "bg-[#FFFDF8] text-[#486256] hover:text-[#075442] border border-[#DCCFB5]"
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
      <div className="ecoroute-card p-6 sm:p-7 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-[#075442] uppercase tracking-wider font-mono flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#075442]" /> Mathematical Formulation &amp; Normalization Contract
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-[#183B32]">
          <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5]">
            <span className="text-[#075442] font-bold block mb-1">1. Composite Score (Jr)</span>
            <p className="text-[#63786C] font-sans text-xs leading-relaxed">
              J_r = w_carbon &times; N(C) + w_duration &times; N(T) + w_util &times; N(U) + w_latency &times; N(L). Lowest score ranks #1.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5]">
            <span className="text-[#8C6212] font-bold block mb-1">2. Min-Max Normalization</span>
            <p className="text-[#63786C] font-sans text-xs leading-relaxed">
              norm(x) = (x - min) / (max - min). If max == min, norm(x) = 0.0 deterministically.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#DCCFB5]">
            <span className="text-[#063B30] font-bold block mb-1">3. Data Quality Rule</span>
            <p className="text-[#63786C] font-sans text-xs leading-relaxed">
              When carbon data is untrusted or unavailable, fallback renormalizes w_duration &amp; w_latency; emissions recorded as NULL.
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
        <div className="p-12 text-center text-[#63786C] animate-pulse font-mono text-xs">
          Loading decision explainer...
        </div>
      }
    >
      <DecisionsContent />
    </Suspense>
  );
}
