"""Abstract base class for all 5 Scheduler Strategies."""

from abc import ABC, abstractmethod
from decimal import Decimal
from typing import List, Optional, Tuple

from app.domain.carbon import CarbonIntensity
from app.domain.region import Region
from app.domain.values import SchedulingWeights
from app.persistence.models.enums import SchedulerVariant
from app.scheduling.energy_estimator import RegionalWorkloadEstimate
from app.scheduling.ranker import RankedCandidate
from app.scheduling.scorer import ScoreCalculator


class SchedulerStrategy(ABC):
    """Base strategy defining weights and ranking behavior for a scheduler variant."""

    def __init__(self, variant: SchedulerVariant) -> None:
        self.variant = variant

    @property
    @abstractmethod
    def base_weights(self) -> SchedulingWeights:
        """Baseline multi-objective weights for this strategy."""
        pass

    @property
    def requires_carbon(self) -> bool:
        """True if the strategy's primary objective incorporates carbon emissions."""
        return self.base_weights.carbon > Decimal("0.0")

    def get_effective_weights(self, carbon_available: bool = True) -> SchedulingWeights:
        """Returns the effective weights, dynamically re-normalizing if carbon is unavailable."""
        if not carbon_available or not self.requires_carbon:
            if self.base_weights.carbon > Decimal("0.0"):
                return ScoreCalculator.renormalize_for_fallback(self.base_weights)
        return self.base_weights

    @abstractmethod
    def rank_candidates(
        self,
        candidates: List[Tuple[Region, RegionalWorkloadEstimate, CarbonIntensity]],
        normalized_metrics: dict,
        carbon_available: bool = True,
        random_seed: Optional[int] = None,
    ) -> List[RankedCandidate]:
        """Scores and orders the feasible candidates according to the strategy policy."""
        pass
