"""DeferredJobEvaluator for interval-controlled re-evaluation of WAITING workloads."""

from datetime import datetime, timezone
import logging
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.job import Job as DomainJob
from app.domain.values import JobPriority, WorkloadDemand
from app.execution.dispatcher import ExecutionDispatcher
from app.persistence.models.enums import DecisionAction, JobStatus, WorkloadType
from app.persistence.models.job import Job
from app.persistence.repositories.audit_event_repository import AuditEventRepository
from app.scheduling.engine import DecisionEngine

logger = logging.getLogger(__name__)


class DeferredJobEvaluator:
    """Re-evaluates workloads that were deferred into the WAITING state.

    Lifecycle rules:
    - If deadline slack is exhausted: transitions Job to FAILED.
    - If dynamic conditions (carbon, utilization, slack) favor EXECUTE: dispatches new attempt.
    - If conditions still favor waiting: remains in WAITING state.
    """

    def __init__(
        self,
        decision_engine: Optional[DecisionEngine] = None,
        dispatcher: Optional[ExecutionDispatcher] = None,
    ):
        self.decision_engine = decision_engine or DecisionEngine()
        self.dispatcher = dispatcher or ExecutionDispatcher()

    async def evaluate_deferred_jobs(
        self,
        session: AsyncSession,
        current_time: Optional[datetime] = None,
        limit: int = 50,
    ) -> Dict[str, int]:
        """Runs a re-evaluation pass across WAITING jobs.

        Returns summary counts: {"evaluated": count, "dispatched": count, "expired": count, "remained_waiting": count}.
        """
        now = current_time or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        audit_repo = AuditEventRepository(session)

        # 1. Fetch WAITING jobs ordered by deadline urgency
        stmt = (
            select(Job)
            .where(Job.status == JobStatus.WAITING.value)
            .order_by(Job.deadline.asc())
            .limit(limit)
            .with_for_update()
        )
        res = await session.execute(stmt)
        waiting_jobs = list(res.scalars().all())

        summary = {
            "evaluated": len(waiting_jobs),
            "dispatched": 0,
            "expired": 0,
            "remained_waiting": 0,
        }

        for db_job in waiting_jobs:
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
                status=JobStatus.WAITING,
                current_attempt_count=db_job.current_attempt_count,
                max_retries=db_job.max_retries,
                created_at=db_job.created_at,
            )

            # Check remaining slack
            slack = domain_job.calculate_slack(current_time=now)

            if slack.slack_seconds <= 0:
                # Deadline slack exhausted
                logger.warning(
                    f"Deferred Job '{db_job.id}' expired: deadline slack depleted ({slack.slack_seconds}s). "
                    "Transitioning to FAILED."
                )
                db_job.status = JobStatus.FAILED.value
                db_job.updated_at = now
                await audit_repo.record_event(
                    event_type="JOB_FAILED",
                    actor="DeferredJobEvaluator",
                    job_id=db_job.id,
                    event_metadata={"reason": "Deadline slack depleted while waiting"},
                    event_timestamp=now,
                )
                summary["expired"] += 1
                continue

            # Slack remains: trigger fresh DecisionEngine evaluation
            try:
                decision = await self.decision_engine.schedule(
                    job=domain_job,
                    current_time=now,
                    session=session,
                )

                if decision.decision_action == DecisionAction.EXECUTE:
                    await self.dispatcher.dispatch_decision(decision, session=session)
                    await audit_repo.record_event(
                        event_type="DEFERRAL_REEVALUATED",
                        actor="DeferredJobEvaluator",
                        job_id=db_job.id,
                        event_metadata={
                            "action": "EXECUTE",
                            "selected_region_id": str(decision.selected_region_id),
                            "cost_score_jr": str(decision.cost_score_jr) if decision.cost_score_jr else None,
                        },
                        event_timestamp=now,
                    )
                    summary["dispatched"] += 1
                else:
                    # Still DEFER
                    summary["remained_waiting"] += 1

            except Exception as exc:
                logger.error(
                    f"Error evaluating deferred job '{db_job.id}': {exc}",
                    exc_info=True,
                )
                summary["remained_waiting"] += 1

        await session.flush()
        return summary
