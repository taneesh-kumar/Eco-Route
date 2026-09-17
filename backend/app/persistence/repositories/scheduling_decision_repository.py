"""Repository for persisting and querying SchedulingDecision records in PostgreSQL."""

from typing import List, Optional
import uuid

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.decision import SchedulingDecision as DomainDecision
from app.persistence.models.scheduling_decision import SchedulingDecision as DBDecision
from app.persistence.repositories.base import BaseRepository


class SchedulingDecisionRepository(BaseRepository[DBDecision]):
    """Repository managing durable persistence for scheduling decisions with full explainability metadata."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(DBDecision, session)

    async def get_latest_for_job(self, job_id: uuid.UUID) -> Optional[DBDecision]:
        """Retrieves the most recent scheduling decision recorded for a workload."""
        stmt = (
            select(DBDecision)
            .where(DBDecision.job_id == job_id)
            .order_by(desc(DBDecision.created_at))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_job(self, job_id: uuid.UUID) -> List[DBDecision]:
        """Retrieves all historical scheduling decisions for a job, ordered newest to oldest."""
        stmt = (
            select(DBDecision)
            .where(DBDecision.job_id == job_id)
            .order_by(desc(DBDecision.created_at))
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def record_decision(self, decision: DomainDecision) -> DBDecision:
        """Persists a domain SchedulingDecision into PostgreSQL with complete JSONB explainability."""
        weights_dict = {
            "carbon": str(decision.applied_weights.carbon),
            "time": str(decision.applied_weights.time),
            "utilization": str(decision.applied_weights.utilization),
            "latency": str(decision.applied_weights.latency),
        }

        db_decision = DBDecision(
            id=decision.id,
            job_id=decision.job_id,
            attempt_id=decision.attempt_id,
            selected_region_id=decision.selected_region_id,
            decision_action=decision.decision_action.value,
            cost_score_jr=decision.cost_score_jr,
            estimated_energy_kwh=decision.estimated_energy_kwh,
            estimated_co2eq_grams=decision.estimated_co2eq_grams,
            carbon_source_used=decision.carbon_source_used.value,
            carbon_quality_used=decision.carbon_quality_used.value,
            decision_reason=decision.decision_reason,
            score_breakdown=decision.score_breakdown,
            candidate_rankings=decision.candidate_rankings,
            applied_weights=weights_dict,
            normalization_factors=decision.normalization_factors,
            created_at=decision.created_at,
        )

        self.session.add(db_decision)
        await self.session.flush()
        await self.session.refresh(db_decision)
        return db_decision
