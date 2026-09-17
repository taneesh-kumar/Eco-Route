"""Application service coordinating workload submission and lifecycle."""

from datetime import datetime, timezone
import logging
from typing import List, Optional, Tuple
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.schemas.jobs import WorkloadCreate
from app.domain.decision import SchedulingDecision
from app.domain.job import Job as DomainJob
from app.domain.values import JobPriority, WorkloadDemand
from app.execution.dispatcher import ExecutionDispatcher
from app.persistence.models.enums import DecisionAction, JobStatus, WorkloadType
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.repositories.audit_event_repository import AuditEventRepository
from app.persistence.repositories.job_repository import JobRepository
from app.scheduling.engine import DecisionEngine

logger = logging.getLogger(__name__)


class JobService:
    """Orchestrates computational workload intake, scheduling, and lifecycle queries."""

    def __init__(
        self,
        decision_engine: Optional[DecisionEngine] = None,
        dispatcher: Optional[ExecutionDispatcher] = None,
    ):
        self.decision_engine = decision_engine or DecisionEngine()
        self.dispatcher = dispatcher or ExecutionDispatcher()

    async def submit_workload(
        self,
        payload: WorkloadCreate,
        session: AsyncSession,
    ) -> Tuple[Job, SchedulingDecision, Optional[JobAttempt]]:
        """Ingests a workload, evaluates scheduling via DecisionEngine, and dispatches."""
        now = datetime.now(timezone.utc)
        job_id = uuid.uuid4()

        # 1. Create durable DB Job
        db_job = Job(
            id=job_id,
            workload_name=payload.workload_name,
            workload_type=payload.workload_type.value,
            cpu_demand=payload.cpu_demand,
            memory_demand=payload.memory_demand,
            base_execution_duration=payload.base_execution_duration,
            priority=payload.priority,
            deadline=payload.deadline,
            status=JobStatus.PENDING.value,
            current_attempt_count=0,
            max_retries=3,
            created_at=now,
            updated_at=now,
        )
        session.add(db_job)
        await session.flush()

        audit_repo = AuditEventRepository(session)
        await audit_repo.record_event(
            event_type="JOB_CREATED",
            actor="API_Client",
            job_id=job_id,
            event_metadata={
                "workload_name": payload.workload_name,
                "workload_type": payload.workload_type.value,
                "cpu_demand": str(payload.cpu_demand),
                "memory_demand": str(payload.memory_demand),
                "priority": payload.priority,
            },
            event_timestamp=now,
        )

        # 2. Construct Domain Job for DecisionEngine
        demand = WorkloadDemand(
            cpu_demand=payload.cpu_demand,
            memory_demand=payload.memory_demand,
            base_execution_duration=payload.base_execution_duration,
        )
        domain_job = DomainJob(
            id=job_id,
            workload_name=payload.workload_name,
            workload_type=payload.workload_type,
            demand=demand,
            priority=JobPriority(payload.priority),
            deadline=payload.deadline,
            status=JobStatus.PENDING,
            current_attempt_count=0,
            max_retries=3,
            created_at=now,
        )

        # 3. Evaluate DecisionEngine pipeline
        decision = await self.decision_engine.schedule(
            job=domain_job,
            variant=payload.scheduler_variant,
            current_time=now,
            session=session,
        )

        # 4. Dispatch if EXECUTE
        dispatched_attempt: Optional[JobAttempt] = None
        if decision.decision_action == DecisionAction.EXECUTE:
            dispatched_attempt = await self.dispatcher.dispatch_decision(
                decision=decision,
                session=session,
            )
        else:
            db_job.status = JobStatus.WAITING.value
            db_job.updated_at = now
            await session.flush()

        return db_job, decision, dispatched_attempt

    async def get_job(
        self,
        job_id: uuid.UUID,
        session: AsyncSession,
    ) -> Optional[Job]:
        """Loads a Job with its attempts eager-loaded."""
        stmt = (
            select(Job)
            .where(Job.id == job_id)
            .options(selectinload(Job.attempts))
        )
        res = await session.execute(stmt)
        return res.scalars().first()

    async def list_jobs(
        self,
        session: AsyncSession,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[Job], int]:
        """Lists jobs with optional status filter and total count."""
        count_stmt = select(func.count(Job.id))
        query_stmt = select(Job).order_by(Job.created_at.desc()).limit(limit).offset(offset)

        if status:
            count_stmt = count_stmt.where(Job.status == status)
            query_stmt = query_stmt.where(Job.status == status)

        total_res = await session.execute(count_stmt)
        total_count = total_res.scalar() or 0

        jobs_res = await session.execute(query_stmt)
        jobs = list(jobs_res.scalars().all())

        return jobs, total_count

    async def cancel_job(
        self,
        job_id: uuid.UUID,
        session: AsyncSession,
    ) -> bool:
        """Safely cancels a PENDING or WAITING job."""
        job_repo = JobRepository(session)
        audit_repo = AuditEventRepository(session)
        now = datetime.now(timezone.utc)

        cancelled = await job_repo.update_status_conditional(
            job_id=job_id,
            from_status=JobStatus.WAITING.value,
            to_status=JobStatus.FAILED.value,
        )
        if not cancelled:
            cancelled = await job_repo.update_status_conditional(
                job_id=job_id,
                from_status=JobStatus.PENDING.value,
                to_status=JobStatus.FAILED.value,
            )

        if cancelled:
            await audit_repo.record_event(
                event_type="JOB_CANCELLED",
                actor="API_Client",
                job_id=job_id,
                event_metadata={"reason": "User requested cancellation"},
                event_timestamp=now,
            )
            await session.flush()

        return cancelled
