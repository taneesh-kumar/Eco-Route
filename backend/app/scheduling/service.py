"""Application service interface for dispatching scheduling workloads."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.decision import SchedulingDecision
from app.domain.job import Job
from app.domain.region import Region
from app.persistence.models.enums import SchedulerVariant
from app.scheduling.engine import DecisionEngine


class SchedulingService:
    """Application service coordinating workload scheduling evaluations."""

    def __init__(self, engine: Optional[DecisionEngine] = None) -> None:
        self.engine = engine or DecisionEngine()

    async def evaluate_workload(
        self,
        job: Job,
        candidate_regions: Optional[List[Region]] = None,
        variant: SchedulerVariant = SchedulerVariant.ECOROUTE,
        current_time: Optional[datetime] = None,
        verified_forecast_jr: Optional[Decimal] = None,
        epsilon: Decimal = Decimal("0.0"),
        random_seed: Optional[int] = None,
        session: Optional[AsyncSession] = None,
    ) -> SchedulingDecision:
        """Evaluates a job through the decision pipeline and returns the persisted decision."""
        return await self.engine.schedule(
            job=job,
            candidate_regions=candidate_regions,
            variant=variant,
            current_time=current_time or datetime.now(timezone.utc),
            verified_forecast_jr=verified_forecast_jr,
            epsilon=epsilon,
            random_seed=random_seed,
            session=session,
        )
