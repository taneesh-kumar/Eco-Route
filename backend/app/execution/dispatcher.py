"""Reliable Dispatcher creating region-locked JobAttempts with atomic attempt numbering."""

from datetime import datetime, timezone
import logging
from typing import List, Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.decision import SchedulingDecision
from app.domain.exceptions import (
    InvalidJobConfigurationError,
    InvalidSchedulingDecisionError,
    RetryBudgetExhaustedError,
)
from app.execution.queue import ExecutionQueue
from app.persistence.models.enums import AttemptStatus, DecisionAction, JobStatus
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.repositories.audit_event_repository import AuditEventRepository
from app.persistence.repositories.job_attempt_repository import JobAttemptRepository

logger = logging.getLogger(__name__)


class DispatcherError(Exception):
    """Base exception for Dispatcher operational failures."""
    pass


class ExecutionDispatcher:
    """Converts verified EXECUTE decisions into region-locked JobAttempts.

    Enforces:
    - Atomic monotonic attempt numbering via database row lock (FOR UPDATE).
    - Hard budget check against job.max_retries.
    - Durable persistence before queueing to Redis.
    - Recovery sweeps for at-least-once delivery guarantees.
    """

    def __init__(self, queue: Optional[ExecutionQueue] = None):
        self.queue = queue or ExecutionQueue()

    async def dispatch_decision(
        self,
        decision: SchedulingDecision,
        session: AsyncSession,
    ) -> Optional[JobAttempt]:
        """Dispatches an EXECUTE decision, persists the new attempt, and queues to Redis.

        Returns the created JobAttempt, or None if the decision was DEFER/REJECT.
        """
        if decision.decision_action != DecisionAction.EXECUTE:
            logger.info(
                f"Decision for job '{decision.job_id}' is '{decision.decision_action.value}'. "
                "No execution attempt created."
            )
            return None

        if decision.selected_region_id is None:
            raise InvalidSchedulingDecisionError(
                f"Cannot dispatch job '{decision.job_id}': EXECUTE decision missing selected_region_id."
            )

        now = datetime.now(timezone.utc)

        # 1. Acquire exclusive lock on the parent Job row to serialize concurrent dispatches
        stmt = (
            select(Job)
            .where(Job.id == decision.job_id)
            .with_for_update()
        )
        res = await session.execute(stmt)
        db_job = res.scalars().first()

        if db_job is None:
            raise DispatcherError(f"Job '{decision.job_id}' does not exist in database.")

        # 2. Check total attempt budget
        if db_job.current_attempt_count >= db_job.max_retries and db_job.current_attempt_count > 0:
            raise RetryBudgetExhaustedError(
                f"Job '{db_job.id}' has exhausted its maximum attempt budget ({db_job.max_retries})."
            )

        # 3. Compute atomic next attempt number
        attempt_repo = JobAttemptRepository(session)
        next_attempt_number = db_job.current_attempt_count + 1

        # 4. Create and persist JobAttempt
        attempt = JobAttempt(
            id=uuid.uuid4(),
            job_id=db_job.id,
            attempt_number=next_attempt_number,
            region_id=decision.selected_region_id,
            status=AttemptStatus.PENDING.value,
        )
        session.add(attempt)

        # 5. Update Job status, assigned_region_id, and counter
        db_job.current_attempt_count = next_attempt_number
        db_job.assigned_region_id = decision.selected_region_id
        db_job.status = JobStatus.DISPATCHED.value
        db_job.updated_at = now

        # 6. Record Audit Event
        audit_repo = AuditEventRepository(session)
        await audit_repo.record_event(
            event_type="JOB_DISPATCHED",
            actor="ExecutionDispatcher",
            job_id=db_job.id,
            attempt_id=attempt.id,
            event_metadata={
                "attempt_number": next_attempt_number,
                "region_id": str(decision.selected_region_id),
                "decision_id": str(decision.id),
                "cost_score_jr": str(decision.cost_score_jr) if decision.cost_score_jr else None,
            },
            event_timestamp=now,
        )

        # Flush mutations to ensure durable presence in DB before enqueue
        await session.flush()

        # 7. Enqueue attempt ID to Redis
        enqueue_success = await self.queue.enqueue(attempt.id)
        if not enqueue_success:
            logger.warning(
                f"Attempt '{attempt.id}' persisted in PostgreSQL but Redis enqueue failed. "
                "Recovery sweep will automatically re-enqueue it."
            )

        return attempt

    async def recover_pending_dispatches(
        self,
        session: AsyncSession,
        older_than_seconds: int = 5,
        limit: int = 100,
    ) -> int:
        """Sweeps orphaned PENDING attempts and re-enqueues them to Redis.

        Provides at-least-once delivery recovery if Redis was temporarily unreachable.
        """
        attempt_repo = JobAttemptRepository(session)
        stale_attempts = await attempt_repo.list_pending_stale(
            older_than_seconds=older_than_seconds,
            limit=limit,
        )

        recovered_count = 0
        for att in stale_attempts:
            logger.info(
                f"Recovery sweep: re-enqueuing stale PENDING attempt '{att.id}' (Job '{att.job_id}')."
            )
            enqueued = await self.queue.enqueue(att.id)
            if enqueued:
                recovered_count += 1

        return recovered_count
