"""Deterministic candidate region ranker with exact tie-breaking."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid

from app.domain.carbon import CarbonIntensity, CarbonQuality
from app.domain.region import Region
from app.scheduling.energy_estimator import RegionalWorkloadEstimate
from app.scheduling.scorer import CandidateScoreResult


@dataclass(frozen=True)
class RankedCandidate:
    """Fully evaluated candidate region in sorted rank order."""
    rank: int
    region: Region
    score_result: CandidateScoreResult
    estimate: RegionalWorkloadEstimate
    carbon: CarbonIntensity

    def to_dict(self) -> Dict[str, Any]:
        """Serializes candidate for explainability candidate_rankings in JSONB."""
        return {
            "rank": self.rank,
            "region_id": str(self.region.id),
            "region_code": self.region.code,
            "region_name": self.region.name,
            "cost_score_jr": str(self.score_result.cost_score_jr),
            "duration_seconds": str(self.estimate.duration_seconds),
            "energy_kwh": str(self.estimate.energy_kwh),
            "emissions_co2eq": str(self.estimate.emissions_co2eq) if self.estimate.emissions_co2eq is not None else None,
            "carbon_quality": self.carbon.quality.value,
            "carbon_intensity": str(self.carbon.value) if self.carbon.value is not None else None,
            "current_utilization": str(self.region.current_utilization),
            "network_latency_ms": str(self.region.network_latency_ms),
            "score_breakdown": self.score_result.score_breakdown,
        }


class RegionRanker:
    """Ranks feasible candidate regions using exact Decimal comparisons and deterministic tie-breaking.

    Tie-breaking hierarchy (for exact J_A == J_B):
    - With carbon: (1) Lower C_r -> (2) Lower T_r -> (3) Lexicographical region.code
    - Without carbon: (1) Lower T_r -> (2) Lexicographical region.code
    """

    @classmethod
    def rank_candidates(
        cls,
        candidates: List[tuple[Region, CandidateScoreResult, RegionalWorkloadEstimate, CarbonIntensity]],
        carbon_available: bool = True,
    ) -> List[RankedCandidate]:
        """Sorts candidates in ascending order of Jr, applying deterministic tie-breaking on ties."""
        if not candidates:
            return []

        def sort_key(item: tuple[Region, CandidateScoreResult, RegionalWorkloadEstimate, CarbonIntensity]):
            region, score_res, estimate, carbon = item
            jr = score_res.cost_score_jr

            if carbon_available and estimate.emissions_co2eq is not None:
                # With carbon: Jr -> Cr -> Tr -> code
                cr = estimate.emissions_co2eq
                tr = estimate.duration_seconds
                return (jr, cr, tr, region.code)
            else:
                # Without carbon: Jr -> Tr -> code
                tr = estimate.duration_seconds
                return (jr, tr, region.code)

        sorted_items = sorted(candidates, key=sort_key)

        ranked: List[RankedCandidate] = []
        for idx, (region, score_res, estimate, carbon) in enumerate(sorted_items, start=1):
            ranked.append(
                RankedCandidate(
                    rank=idx,
                    region=region,
                    score_result=score_res,
                    estimate=estimate,
                    carbon=carbon,
                )
            )

        return ranked
