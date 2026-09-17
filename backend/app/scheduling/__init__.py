"""Scheduling Engine package for EcoRoute."""

from app.scheduling.deferral import DeferralEvaluationResult, DeferralEvaluator
from app.scheduling.energy_estimator import EnergyEstimator, RegionalWorkloadEstimate
from app.scheduling.engine import (
    DecisionEngine,
    SchedulingEngineError,
    UnschedulableWorkloadError,
)
from app.scheduling.normalizer import MetricBounds, NormalizedCandidateMetrics, Normalizer
from app.scheduling.ranker import RankedCandidate, RegionRanker
from app.scheduling.scorer import CandidateScoreResult, ScoreCalculator
from app.scheduling.service import SchedulingService
from app.scheduling.strategies import (
    CarbonOnlyStrategy,
    ConventionalStrategy,
    EcoRouteStrategy,
    PerformanceOnlyStrategy,
    RandomStrategy,
    SchedulerStrategy,
    get_scheduler_strategy,
)

__all__ = [
    "EnergyEstimator",
    "RegionalWorkloadEstimate",
    "Normalizer",
    "MetricBounds",
    "NormalizedCandidateMetrics",
    "ScoreCalculator",
    "CandidateScoreResult",
    "RegionRanker",
    "RankedCandidate",
    "DeferralEvaluator",
    "DeferralEvaluationResult",
    "DecisionEngine",
    "SchedulingEngineError",
    "UnschedulableWorkloadError",
    "SchedulingService",
    "SchedulerStrategy",
    "EcoRouteStrategy",
    "ConventionalStrategy",
    "CarbonOnlyStrategy",
    "PerformanceOnlyStrategy",
    "RandomStrategy",
    "get_scheduler_strategy",
]
