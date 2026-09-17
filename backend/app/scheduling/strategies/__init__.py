"""Scheduler strategy factory and exports."""

from app.persistence.models.enums import SchedulerVariant
from app.scheduling.strategies.base import SchedulerStrategy
from app.scheduling.strategies.carbon_only import CarbonOnlyStrategy
from app.scheduling.strategies.conventional import ConventionalStrategy
from app.scheduling.strategies.ecoroute import EcoRouteStrategy
from app.scheduling.strategies.performance_only import PerformanceOnlyStrategy
from app.scheduling.strategies.random import RandomStrategy

STRATEGY_REGISTRY = {
    SchedulerVariant.ECOROUTE: EcoRouteStrategy,
    SchedulerVariant.CONVENTIONAL: ConventionalStrategy,
    SchedulerVariant.CARBON_ONLY: CarbonOnlyStrategy,
    SchedulerVariant.PERFORMANCE_ONLY: PerformanceOnlyStrategy,
    SchedulerVariant.RANDOM: RandomStrategy,
}


def get_scheduler_strategy(variant: SchedulerVariant) -> SchedulerStrategy:
    """Factory retrieving the strategy implementation for a given SchedulerVariant."""
    strategy_cls = STRATEGY_REGISTRY.get(variant)
    if not strategy_cls:
        raise ValueError(f"Unknown scheduler variant: {variant}")
    return strategy_cls()


__all__ = [
    "SchedulerStrategy",
    "EcoRouteStrategy",
    "ConventionalStrategy",
    "CarbonOnlyStrategy",
    "PerformanceOnlyStrategy",
    "RandomStrategy",
    "get_scheduler_strategy",
]
