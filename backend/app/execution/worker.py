"""ExecutionWorker executing idempotent attempt lifecycle with simulated telemetry."""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.carbon.service import CarbonService
from app.domain.region import Region as DomainRegion
from app.domain.values import WorkloadDemand
from app.execution.idempotency import IdempotencyManager
from app.execution.queue import ExecutionQueue
from app.execution.retry import RetryManager
from app.execution.telemetry import ExecutionTelemetry
from app.persistence.models.enums import AttemptStatus, JobStatus
from app.persistence.repositories.audit_event_repository import AuditEventRepository
from app.persistence.repositories.job_attempt_repository import JobAttemptRepository
from app.persistence.repositories.job_repository import JobRepository

logger = logging.getLogger(__name__)


class ExecutionWorker:
    """Consumes attempt IDs from ExecutionQueue, claims atomically, and executes workloads.

    Enforces:
    - Exactly-once claim semantics via IdempotencyManager (PostgreSQL CAS).
    - Simulated duration, energy, and zero-fabrication carbon telemetry.
    - Automatic failure routing via RetryManager.
    - Graceful shutdown controls.
    """

    def __init__(
        self,
        worker_id: Optional[str] = None,
        queue: Optional[ExecutionQueue] = None,
        idempotency_manager: Optional[IdempotencyManager] = None,
        carbon_service: Optional[CarbonService] = None,
        retry_manager: Optional[RetryManager] = None,
    ):
        self.worker_id = worker_id or f"worker-{uuid.uuid4().hex[:8]}"
        self.queue = queue or ExecutionQueue()
        self.idempotency_manager = idempotency_manager or IdempotencyManager()
        self.carbon_service = carbon_service or CarbonService()
        self.retry_manager = retry_manager or RetryManager()
        self._running = False

    async def process_one(
        self,
        session: AsyncSession,
        timeout_seconds: int = 1,
        simulate_failure: bool = False,
        failure_error_message: str = "Simulated worker execution failure",
    ) -> Optional[uuid.UUID]:
        """Dequeues, claims, and processes a single attempt.

        Returns attempt_id if processed, None if queue was empty or attempt already claimed.
        """
        attempt_id = await self.queue.dequeue(timeout_seconds=timeout_seconds)
        if attempt_id is None:
            # PostgreSQL Direct Polling Fallback: discover unclaimed PENDING attempt
            attempt_repo = JobAttemptRepository(session)
            pending_attempts = await attempt_repo.list_pending_stale(older_than_seconds=0, limit=1)
            if pending_attempts:
                attempt_id = pending_attempts[0].id
                logger.info(
                    f"Worker '{self.worker_id}' discovered unclaimed PENDING attempt '{attempt_id}' via DB fallback."
                )
            else:
                return None

        # 1. Atomic Idempotent Claim
        claimed = await self.idempotency_manager.claim_attempt(
            attempt_id=attempt_id,
            worker_id=self.worker_id,
            session=session,
            use_redis_lock=True,
        )

        if not claimed:
            logger.debug(
                f"Worker '{self.worker_id}' could not claim attempt '{attempt_id}' (stale or competing worker won)."
            )
            return None

        attempt_repo = JobAttemptRepository(session)
        job_repo = JobRepository(session)
        audit_repo = AuditEventRepository(session)

        now = datetime.now(timezone.utc)

        try:
            # 2. Load attempt with job and region
            attempt = await attempt_repo.get_with_relations(attempt_id)
            if attempt is None:
                logger.error(f"Claimed attempt '{attempt_id}' not found in database.")
                return None

            # 3. Transition to RUNNING
            await attempt_repo.start_attempt(attempt_id, started_at=now)
            await job_repo.update_status_conditional(
                job_id=attempt.job_id,
                from_status=JobStatus.DISPATCHED.value,
                to_status=JobStatus.RUNNING.value,
            )

            await audit_repo.record_event(
                event_type="ATTEMPT_STARTED",
                actor=self.worker_id,
                job_id=attempt.job_id,
                attempt_id=attempt.id,
                event_metadata={
                    "attempt_number": attempt.attempt_number,
                    "region_id": str(attempt.region_id),
                },
                event_timestamp=now,
            )
            await session.flush()

            # 4. Handle Simulated Failure Injection
            if simulate_failure:
                logger.warning(
                    f"Worker '{self.worker_id}' injecting failure on attempt '{attempt.id}'."
                )
                await self.retry_manager.handle_attempt_failure(
                    attempt_id=attempt.id,
                    error_message=failure_error_message,
                    session=session,
                    current_time=now,
                )
                return attempt.id

            # 5. Execute Simulation & Collect Telemetry
            db_job = attempt.job
            db_region = attempt.region

            demand = WorkloadDemand(
                cpu_demand=db_job.cpu_demand,
                memory_demand=db_job.memory_demand,
                base_execution_duration=db_job.base_execution_duration,
            )
            domain_region = DomainRegion(
                id=db_region.id,
                code=db_region.code,
                name=db_region.name,
                provider=db_region.provider,
                max_cpu_capacity=db_region.max_cpu_capacity,
                max_memory_capacity=db_region.max_memory_capacity,
                current_utilization=db_region.current_utilization,
                performance_factor=db_region.performance_factor,
                idle_power_watts=db_region.idle_power_watts,
                peak_power_watts=db_region.peak_power_watts,
                network_latency_ms=db_region.network_latency_ms,
                is_available=db_region.is_available,
                is_active=db_region.is_active,
            )

            # Query real-time / cached carbon for execution window
            carbon_obs = await self.carbon_service.get_carbon_intensity(
                region=domain_region,
                session=session,
            )

            telemetry = ExecutionTelemetry.calculate_observed(
                demand=demand,
                region=domain_region,
                carbon=carbon_obs,
            )

            # 6. Complete Attempt
            completed_time = datetime.now(timezone.utc)
            await attempt_repo.complete_attempt(
                attempt_id=attempt.id,
                actual_duration=telemetry.actual_duration_seconds,
                actual_energy_kwh=telemetry.actual_energy_kwh,
                actual_co2eq_grams=telemetry.actual_co2eq_grams,
                completed_at=completed_time,
            )

            # 7. Complete Job
            await job_repo.update_status_conditional(
                job_id=db_job.id,
                from_status=JobStatus.RUNNING.value,
                to_status=JobStatus.COMPLETED.value,
            )

            # 8. Record Completion Audit Events
            await audit_repo.record_event(
                event_type="ATTEMPT_COMPLETED",
                actor=self.worker_id,
                job_id=db_job.id,
                attempt_id=attempt.id,
                event_metadata={
                    "actual_duration": str(telemetry.actual_duration_seconds),
                    "actual_energy_kwh": str(telemetry.actual_energy_kwh),
                    "actual_co2eq_grams": (
                        str(telemetry.actual_co2eq_grams)
                        if telemetry.actual_co2eq_grams is not None
                        else None
                    ),
                    "carbon_quality": telemetry.carbon_quality_used.value,
                },
                event_timestamp=completed_time,
            )
            await audit_repo.record_event(
                event_type="JOB_COMPLETED",
                actor=self.worker_id,
                job_id=db_job.id,
                attempt_id=attempt.id,
                event_metadata={
                    "total_attempts": attempt.attempt_number,
                    "final_region": str(attempt.region_id),
                },
                event_timestamp=completed_time,
            )

            await session.flush()
            logger.info(
                f"Worker '{self.worker_id}' successfully completed attempt '{attempt.id}' "
                f"for Job '{db_job.id}' in region '{db_region.code}'."
            )
            return attempt.id

        except Exception as exc:
            logger.error(
                f"Worker '{self.worker_id}' encountered unexpected error executing attempt '{attempt_id}': {exc}",
                exc_info=True,
            )
            await self.retry_manager.handle_attempt_failure(
                attempt_id=attempt_id,
                error_message=f"Worker unexpected error: {str(exc)}",
                session=session,
                current_time=now,
            )
            return attempt_id

        finally:
            # Safely release Redis mutex lock
            await self.idempotency_manager.release_lock(attempt_id, self.worker_id)

    async def run_loop(self, poll_interval: float = 0.5) -> None:
        """Continuously dequeues and processes attempts from the queue."""
        from app.db.session import get_db_sessionmaker
        self._running = True
        logger.info(f"ExecutionWorker '{self.worker_id}' started background processing loop.")
        while self._running:
            try:
                sessionmaker = get_db_sessionmaker()
                if sessionmaker:
                    async with sessionmaker() as session:
                        try:
                            processed_id = await self.process_one(session=session, timeout_seconds=1)
                            if processed_id:
                                await session.commit()
                        except Exception as exc:
                            await session.rollback()
                            logger.error(f"Worker '{self.worker_id}' run loop attempt error: {exc}", exc_info=True)
                await asyncio.sleep(poll_interval)
            except asyncio.CancelledError:
                logger.info(f"Worker '{self.worker_id}' run loop cancelled.")
                break
            except Exception as top_exc:
                logger.error(f"Worker '{self.worker_id}' run loop top-level error: {top_exc}")
                await asyncio.sleep(poll_interval)

    def stop(self) -> None:
        """Signals the worker loop to shut down cleanly."""
        self._running = False
        logger.info(f"Worker '{self.worker_id}' received stop signal.")
