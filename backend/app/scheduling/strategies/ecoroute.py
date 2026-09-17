"""EcoRoute multi-objective optimization scheduler strategy."""

from decimal import Decimal
from typing import List, Optional, Tuple

from app.domain.carbon import CarbonIntensity
from app.domain.region import Region
from app.domain.values import SchedulingWeights
from app.persistence.models.enums import SchedulerVariant
from app.scheduling.energy_estimator import RegionalWorkloadEstimate
from app.scheduling.ranker import RankedCandidate, RegionRanker
from app.scheduling.scorer import ScoreCalculator
from app.scheduling.strategies.base import SchedulerStrategy


class EcoRouteStrategy(SchedulerStrategy):
    """Balanced multi-objective strategy optimizing carbon, duration, utilization, and latency.

    Default Weights:
    - w_C = 0.40
    - w_T = 0.30
    - w_U = 0.20
    - w_L = 0.10

    When carbon data is unavailable, triggers runtime fallback: w_C = 0 and re-normalizes.
    """

    def __init__(self) -> None:
        super().__init__(SchedulerVariant.ECOROUTE)

    @property
    def base_weights(self) -> SchedulingWeights:
        return SchedulingWeights(
            carbon=Decimal("0.40"),
            time=Decimal("0.30"),
            utilization=Decimal("0.20"),
            latency=Decimal("0.10"),
        )

    def rank_candidates(
        self,
        candidates: List[Tuple[Region, RegionalWorkloadEstimate, CarbonIntensity]],
        normalized_metrics: dict,
        carbon_available: bool = True,
        random_seed: Optional[int] = None,
    ) -> List[RankedCandidate]:
        effective_weights = self.get_effective_weights(carbon_available=carbon_available)

        scored_candidates = []
        for region, estimate, carbon in candidates:
            norm_m = normalized_metrics[region.id]
            score_res = ScoreCalculator.calculate_score(
                metrics=norm_m,
                weights=effective_weights,
                carbon_available=carbon_available,
            )
            scored_candidates.append((region, score_res, estimate, carbon))

        return RegionRanker.rank_candidates(
            candidates=scored_candidates,
            carbon_available=carbon_available,
        )
