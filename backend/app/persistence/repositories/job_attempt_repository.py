import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.persistence.models.job_attempt import JobAttempt
from app.persistence.models.enums import AttemptStatus
from app.persistence.repositories.base import BaseRepository


class JobAttemptRepository(BaseRepository[JobAttempt]):
    """Repository handling persistence, atomic CAS updates, and telemetry for JobAttempts."""

    def __init__(self, session: AsyncSession):
        super().__init__(JobAttempt, session)

    async def get_with_relations(self, attempt_id: uuid.UUID) -> Optional[JobAttempt]:
        """Loads a JobAttempt with job and region loaded eagerly."""
        stmt = (
            select(JobAttempt)
            .where(JobAttempt.id == attempt_id)
            .options(
                selectinload(JobAttempt.job),
                selectinload(JobAttempt.region),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_next_attempt_number(self, job_id: uuid.UUID) -> int:
        """Computes the next monotonically increasing attempt number for a job."""
        stmt = select(func.coalesce(func.max(JobAttempt.attempt_number), 0)).where(
            JobAttempt.job_id == job_id
        )
        res = await self.session.execute(stmt)
        max_num = res.scalar() or 0
        return max_num + 1

    async def claim_attempt_atomic(
        self,
        attempt_id: uuid.UUID,
        worker_id: str,
        claimed_at: Optional[datetime] = None,
    ) -> bool:
        """
        Atomically transitions an attempt from PENDING to CLAIMED via Compare-And-Swap (CAS).
        Returns True if this worker successfully claimed the attempt, False if already claimed or processed.
        """
        now = claimed_at or datetime.now(timezone.utc)
        stmt = (
            update(JobAttempt)
            .where(
                JobAttempt.id == attempt_id,
                JobAttempt.status == AttemptStatus.PENDING.value,
            )
            .values(
                status=AttemptStatus.CLAIMED.value,
                claimed_by_worker=worker_id,
                claimed_at=now,
                updated_at=now,
            )
        )
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.rowcount == 1

    async def start_attempt(
        self,
        attempt_id: uuid.UUID,
        started_at: Optional[datetime] = None,
    ) -> bool:
        """Transitions attempt from CLAIMED to RUNNING."""
        now = started_at or datetime.now(timezone.utc)
        stmt = (
            update(JobAttempt)
            .where(
                JobAttempt.id == attempt_id,
                JobAttempt.status == AttemptStatus.CLAIMED.value,
            )
            .values(
                status=AttemptStatus.RUNNING.value,
                started_at=now,
                updated_at=now,
            )
        )
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.rowcount == 1

    async def complete_attempt(
        self,
        attempt_id: uuid.UUID,
        actual_duration: Decimal,
        actual_energy_kwh: Decimal,
        actual_co2eq_grams: Optional[Decimal] = None,
        completed_at: Optional[datetime] = None,
    ) -> bool:
        """Transitions attempt from RUNNING to COMPLETED and durably stores observed telemetry."""
        now = completed_at or datetime.now(timezone.utc)
        stmt = (
            update(JobAttempt)
            .where(
                JobAttempt.id == attempt_id,
                JobAttempt.status == AttemptStatus.RUNNING.value,
            )
            .values(
                status=AttemptStatus.COMPLETED.value,
                actual_duration=actual_duration,
                actual_energy_kwh=actual_energy_kwh,
                actual_co2eq_grams=actual_co2eq_grams,
                completed_at=now,
                updated_at=now,
            )
        )
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.rowcount == 1

    async def fail_attempt(
        self,
        attempt_id: uuid.UUID,
        error_message: str,
        completed_at: Optional[datetime] = None,
    ) -> bool:
        """Transitions attempt from RUNNING or CLAIMED to FAILED with error context."""
        now = completed_at or datetime.now(timezone.utc)
        stmt = (
            update(JobAttempt)
            .where(
                JobAttempt.id == attempt_id,
                JobAttempt.status.in_([AttemptStatus.RUNNING.value, AttemptStatus.CLAIMED.value]),
            )
            .values(
                status=AttemptStatus.FAILED.value,
                error_message=error_message,
                completed_at=now,
                updated_at=now,
            )
        )
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.rowcount == 1

    async def list_pending_stale(
        self,
        older_than_seconds: int = 5,
        limit: int = 100,
    ) -> List[JobAttempt]:
        """
        Finds PENDING attempts whose creation time exceeds the recovery threshold.
        Used by the reliable dispatch sweep to re-enqueue dropped messages.
        """
        threshold = datetime.now(timezone.utc) - timedelta(seconds=older_than_seconds)
        stmt = (
            select(JobAttempt)
            .where(
                JobAttempt.status == AttemptStatus.PENDING.value,
                JobAttempt.created_at <= threshold,
            )
            .order_by(JobAttempt.created_at.asc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())
