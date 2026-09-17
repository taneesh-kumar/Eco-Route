"""Application service for scheduling decisions and explainability inspection."""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.execution.deferral_evaluator import DeferredJobEvaluator
from app.persistence.models.scheduling_decision import SchedulingDecision


class SchedulingQueryService:
    """Coordinates queries over historical scheduling decisions and explainability data."""

    def __init__(self, deferral_evaluator: Optional[DeferredJobEvaluator] = None):
        self.deferral_evaluator = deferral_evaluator or DeferredJobEvaluator()

    async def get_decision(
        self,
        decision_id: uuid.UUID,
        session: AsyncSession,
    ) -> Optional[SchedulingDecision]:
        """Loads a scheduling decision by ID."""
        stmt = select(SchedulingDecision).where(SchedulingDecision.id == decision_id)
        res = await session.execute(stmt)
        return res.scalars().first()

    async def get_latest_for_job(
        self,
        job_id: uuid.UUID,
        session: AsyncSession,
    ) -> Optional[SchedulingDecision]:
        """Loads the most recent scheduling decision for a job."""
        stmt = (
            select(SchedulingDecision)
            .where(SchedulingDecision.job_id == job_id)
            .order_by(SchedulingDecision.created_at.desc())
        )
        res = await session.execute(stmt)
        return res.scalars().first()

    async def list_decisions(
        self,
        session: AsyncSession,
        job_id: Optional[uuid.UUID] = None,
        region_id: Optional[uuid.UUID] = None,
        action: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[SchedulingDecision], int]:
        """Lists scheduling decisions with filtering and total count."""
        count_stmt = select(func.count(SchedulingDecision.id))
        query_stmt = (
            select(SchedulingDecision)
            .order_by(SchedulingDecision.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        if job_id:
            count_stmt = count_stmt.where(SchedulingDecision.job_id == job_id)
            query_stmt = query_stmt.where(SchedulingDecision.job_id == job_id)
        if region_id:
            count_stmt = count_stmt.where(SchedulingDecision.selected_region_id == region_id)
            query_stmt = query_stmt.where(SchedulingDecision.selected_region_id == region_id)
        if action:
            count_stmt = count_stmt.where(SchedulingDecision.decision_action == action)
            query_stmt = query_stmt.where(SchedulingDecision.decision_action == action)

        total_res = await session.execute(count_stmt)
        total_count = total_res.scalar() or 0

        res = await session.execute(query_stmt)
        decisions = list(res.scalars().all())

        return decisions, total_count

    async def evaluate_deferred(
        self,
        session: AsyncSession,
        current_time: Optional[datetime] = None,
    ) -> Dict[str, int]:
        """Runs a re-evaluation pass across all WAITING jobs."""
        return await self.deferral_evaluator.evaluate_deferred_jobs(
            session=session,
            current_time=current_time or datetime.now(timezone.utc),
        )
