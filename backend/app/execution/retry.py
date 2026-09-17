"""RetryManager orchestrating fresh multi-objective re-routing upon attempt failures."""

from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.job import Job as DomainJob
from app.domain.values import JobPriority, WorkloadDemand
from app.execution.dispatcher import ExecutionDispatcher
from app.persistence.models.enums import AttemptStatus, DecisionAction, JobStatus, WorkloadType
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.repositories.audit_event_repository import AuditEventRepository
from app.persistence.repositories.job_attempt_repository import JobAttemptRepository
from app.scheduling.engine import DecisionEngine

logger = logging.getLogger(__name__)


class RetryManager:
    """Evaluates retry eligibility and triggers fresh DecisionEngine re-routing.

    Invariants:
    - Preserves max_retries semantics: total attempt budget.
    - Failed attempts never blindly reuse the previous region.
    - Re-routing evaluates current dynamic conditions (carbon, utilization, feasibility, slack).
    """

    def __init__(
        self,
        decision_engine: Optional[DecisionEngine] = None,
        dispatcher: Optional[ExecutionDispatcher] = None,
    ):
        self.decision_engine = decision_engine or DecisionEngine()
        self.dispatcher = dispatcher or ExecutionDispatcher()

    async def handle_attempt_failure(
        self,
        attempt_id: uuid.UUID,
        error_message: str,
        session: AsyncSession,
        current_time: Optional[datetime] = None,
    ) -> Optional[JobAttempt]:
        """Processes an attempt failure, determines retry eligibility, and re-routes.

        Returns the newly dispatched JobAttempt if retry was successful, or None.
        """
        now = current_time or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        attempt_repo = JobAttemptRepository(session)
        audit_repo = AuditEventRepository(session)

        # 1. Load attempt and mark FAILED
        attempt = await attempt_repo.get_with_relations(attempt_id)
        if attempt is None:
            logger.error(f"Cannot handle failure: Attempt '{attempt_id}' not found.")
            return None

        if attempt.status != AttemptStatus.FAILED.value:
            await attempt_repo.fail_attempt(
                attempt_id=attempt_id,
                error_message=error_message,
                completed_at=now,
            )

        # 2. Lock parent Job row
        stmt = select(Job).where(Job.id == attempt.job_id).with_for_update()
        res = await session.execute(stmt)
        db_job = res.scalars().first()

        if db_job is None:
            logger.error(f"Cannot retry: Parent Job '{attempt.job_id}' not found.")
            return None

        # 3. Construct Domain Job to check authoritative can_retry()
        demand = WorkloadDemand(
            cpu_demand=db_job.cpu_demand,
            memory_demand=db_job.memory_demand,
            base_execution_duration=db_job.base_execution_duration,
        )
        domain_job = DomainJob(
            id=db_job.id,
            workload_name=db_job.workload_name,
            workload_type=WorkloadType(db_job.workload_type),
            demand=demand,
            priority=JobPriority(db_job.priority),
            deadline=db_job.deadline,
            status=JobStatus(db_job.status),
            current_attempt_count=db_job.current_attempt_count,
            max_retries=db_job.max_retries,
            created_at=db_job.created_at,
        )

        can_retry = domain_job.can_retry(current_time=now)

        if not can_retry:
            logger.info(
                f"Job '{db_job.id}' cannot retry (attempts={db_job.current_attempt_count}/{db_job.max_retries}). "
                "Marking job as FAILED."
            )
            db_job.status = JobStatus.FAILED.value
            db_job.updated_at = now

            await audit_repo.record_event(
                event_type="JOB_FAILED",
                actor="RetryManager",
                job_id=db_job.id,
                attempt_id=attempt.id,
                event_metadata={
                    "reason": "Attempt budget or deadline slack exhausted",
                    "final_attempt_number": attempt.attempt_number,
                    "error_message": error_message,
                },
                event_timestamp=now,
            )
            await session.flush()
            return None

        # 4. Eligible for retry: transition to EVALUATING
        logger.info(
            f"Job '{db_job.id}' eligible for retry (attempt {db_job.current_attempt_count}/{db_job.max_retries}). "
            "Triggering fresh multi-objective evaluation."
        )
        db_job.status = JobStatus.EVALUATING.value
        db_job.updated_at = now
        domain_job.status = JobStatus.EVALUATING

        await audit_repo.record_event(
            event_type="RETRY_REQUESTED",
            actor="RetryManager",
            job_id=db_job.id,
            attempt_id=attempt.id,
            event_metadata={
                "failed_attempt_number": attempt.attempt_number,
                "error_message": error_message,
            },
            event_timestamp=now,
        )
        await session.flush()

        # 5. Execute FRESH scheduling decision under current conditions
        new_decision = await self.decision_engine.schedule(
            job=domain_job,
            current_time=now,
            session=session,
        )

        # 6. Dispatch new attempt if fresh decision is EXECUTE
        if new_decision.decision_action == DecisionAction.EXECUTE:
            new_attempt = await self.dispatcher.dispatch_decision(
                decision=new_decision,
                session=session,
            )
            logger.info(
                f"Retry dispatched: Job '{db_job.id}' -> Attempt '{new_attempt.id}' "
                f"(Attempt #{new_attempt.attempt_number}, Region: '{new_attempt.region_id}')."
            )
            return new_attempt
        else:
            # Deferred under current conditions
            db_job.status = JobStatus.WAITING.value
            db_job.updated_at = now
            await session.flush()
            logger.info(f"Retry evaluation resulted in DEFER for Job '{db_job.id}'.")
            return None
