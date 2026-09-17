"""Deterministic random selection strategy using an isolated seeded generator."""

from decimal import Decimal
import random
from typing import List, Optional, Tuple

from app.domain.carbon import CarbonIntensity
from app.domain.region import Region
from app.domain.values import SchedulingWeights
from app.persistence.models.enums import SchedulerVariant
from app.scheduling.energy_estimator import RegionalWorkloadEstimate
from app.scheduling.ranker import RankedCandidate
from app.scheduling.scorer import CandidateScoreResult
from app.scheduling.strategies.base import SchedulerStrategy


class RandomStrategy(SchedulerStrategy):
    """Uniform selection over feasible candidates using an isolated random.Random instance.

    Guarantees:
    - Only feasible candidates are considered.
    - Deterministic reproducibility when given the same seed.
    - Zero pollution of global random state.
    """

    def __init__(self) -> None:
        super().__init__(SchedulerVariant.RANDOM)

    @property
    def base_weights(self) -> SchedulingWeights:
        return SchedulingWeights(
            carbon=Decimal("0.25"),
            time=Decimal("0.25"),
            utilization=Decimal("0.25"),
            latency=Decimal("0.25"),
        )

    def rank_candidates(
        self,
        candidates: List[Tuple[Region, RegionalWorkloadEstimate, CarbonIntensity]],
        normalized_metrics: dict,
        carbon_available: bool = True,
        random_seed: Optional[int] = None,
    ) -> List[RankedCandidate]:
        if not candidates:
            return []

        # Isolated RNG with optional seed
        rng = random.Random(random_seed)

        # Shuffle a copy of candidate indices deterministically
        indices = list(range(len(candidates)))
        rng.shuffle(indices)

        ranked: List[RankedCandidate] = []
        for rank_pos, idx in enumerate(indices, start=1):
            region, estimate, carbon = candidates[idx]
            # Assign Jr = 0.0 for selected top choice, or normalized position
            cost_jr = Decimal(str(rank_pos - 1)) / Decimal(str(len(candidates))) if len(candidates) > 1 else Decimal("0.0")

            score_res = CandidateScoreResult(
                cost_score_jr=cost_jr,
                applied_weights=self.base_weights,
                score_breakdown={"strategy": "RANDOM", "random_rank": rank_pos},
            )

            ranked.append(
                RankedCandidate(
                    rank=rank_pos,
                    region=region,
                    score_result=score_res,
                    estimate=estimate,
                    carbon=carbon,
                )
            )

        return ranked
