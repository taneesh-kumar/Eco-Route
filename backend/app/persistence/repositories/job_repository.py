import uuid
from typing import List, Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.repositories.base import BaseRepository


class JobRepository(BaseRepository[Job]):
    def __init__(self, session: AsyncSession):
        super().__init__(Job, session)

    async def get_with_attempts(self, job_id: uuid.UUID) -> Optional[Job]:
        stmt = (
            select(Job)
            .where(Job.id == job_id)
            .options(selectinload(Job.attempts))
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def list_by_status(
        self,
        status: str,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Job]:
        stmt = (
            select(Job)
            .where(Job.status == status)
            .order_by(Job.deadline.asc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_status_conditional(
        self,
        job_id: uuid.UUID,
        from_status: str,
        to_status: str,
    ) -> bool:
        """
        Generic conditional update primitive.
        Updates status if and only if the current status matches from_status.
        Returns True if a row was updated, False otherwise.
        """
        stmt = (
            update(Job)
            .where(Job.id == job_id, Job.status == from_status)
            .values(status=to_status)
        )
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.rowcount > 0

    async def add_attempt(self, attempt: JobAttempt) -> JobAttempt:
        self.session.add(attempt)
        await self.session.flush()
        return attempt

    async def get_attempt_by_number(
        self,
        job_id: uuid.UUID,
        attempt_number: int,
    ) -> Optional[JobAttempt]:
        stmt = (
            select(JobAttempt)
            .where(
                JobAttempt.job_id == job_id,
                JobAttempt.attempt_number == attempt_number,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()
