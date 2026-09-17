"""Carbon-only optimization scheduler strategy."""

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


class CarbonOnlyStrategy(SchedulerStrategy):
    """Pure carbon optimization variant: w_C = 1.0, w_T = 0, w_U = 0, w_L = 0.

    If carbon data is unavailable, triggers zero-fabrication fallback.
    """

    def __init__(self) -> None:
        super().__init__(SchedulerVariant.CARBON_ONLY)

    @property
    def base_weights(self) -> SchedulingWeights:
        return SchedulingWeights(
            carbon=Decimal("1.0"),
            time=Decimal("0.0"),
            utilization=Decimal("0.0"),
            latency=Decimal("0.0"),
        )

    def rank_candidates(
        self,
        candidates: List[Tuple[Region, RegionalWorkloadEstimate, CarbonIntensity]],
        normalized_metrics: dict,
        carbon_available: bool = True,
        random_seed: Optional[int] = None,
    ) -> List[RankedCandidate]:
        if carbon_available:
            weights = self.base_weights
        else:
            # Fallback when carbon unavailable: prioritize duration
            weights = SchedulingWeights(
                carbon=Decimal("0.0"),
                time=Decimal("1.0"),
                utilization=Decimal("0.0"),
                latency=Decimal("0.0"),
            )

        scored_candidates = []
        for region, estimate, carbon in candidates:
            norm_m = normalized_metrics[region.id]
            score_res = ScoreCalculator.calculate_score(
                metrics=norm_m,
                weights=weights,
                carbon_available=carbon_available,
            )
            scored_candidates.append((region, score_res, estimate, carbon))

        return RegionRanker.rank_candidates(
            candidates=scored_candidates,
            carbon_available=carbon_available,
        )
