"""Unit and integration tests for resilient execution engine, fallback queue, recovery loop, and deferral slack lifecycle."""

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.decision import SchedulingDecision
from app.domain.job import Job as DomainJob
from app.domain.values import DeadlineSlack, JobPriority, WorkloadDemand
from app.execution.deferral_evaluator import DeferredJobEvaluator
from app.execution.dispatcher import ExecutionDispatcher
from app.execution.queue import ExecutionQueue
from app.execution.worker import ExecutionWorker
from app.main import run_recovery_loop
from app.persistence.models.enums import AttemptStatus, DecisionAction, JobStatus, WorkloadType
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.models.region import Region
from app.persistence.repositories.job_attempt_repository import JobAttemptRepository
from app.persistence.repositories.job_repository import JobRepository
from app.scheduling.deferral import DeferralEvaluator


@pytest.mark.asyncio
async def test_redis_unavailable_enqueue_fallback():
    """Verifies queue falls back to in-memory transport when Redis raises error."""
    mock_redis = AsyncMock()
    mock_redis.lpush.side_effect = ConnectionError("Redis connection lost")
    mock_redis.llen.side_effect = ConnectionError("Redis connection lost")

    queue = ExecutionQueue(redis_client=mock_redis, use_memory_fallback_on_error=True)
    attempt_id = uuid.uuid4()

    # Enqueue should catch Exception, log warning, and push to in-memory queue
    success = await queue.enqueue(attempt_id)
    assert success is True
    assert await queue.length() == 1


@pytest.mark.asyncio
async def test_redis_unavailable_dequeue_fallback():
    """Verifies dequeue retrieves from in-memory fallback when Redis is unreachable."""
    mock_redis = AsyncMock()
    mock_redis.lpush.side_effect = ConnectionError("Redis unavailable")
    mock_redis.brpop.side_effect = ConnectionError("Redis unavailable")
    mock_redis.llen.side_effect = ConnectionError("Redis unavailable")

    queue = ExecutionQueue(redis_client=mock_redis, use_memory_fallback_on_error=True)
    attempt_id = uuid.uuid4()

    # Populate memory queue via fallback enqueue
    await queue.enqueue(attempt_id)

    popped_id = await queue.dequeue(timeout_seconds=1)
    assert popped_id == attempt_id
    assert await queue.length() == 0


@pytest.mark.asyncio
async def test_worker_db_fallback_claims_pending_attempt():
    """Verifies worker fallback queries PostgreSQL for PENDING attempt when queue returns None."""
    attempt_id = uuid.uuid4()
    job_id = uuid.uuid4()
    region_id = uuid.uuid4()

    mock_queue = AsyncMock(spec=ExecutionQueue)
    mock_queue.dequeue.return_value = None  # Queue empty

    mock_session = AsyncMock(spec=AsyncSession)

    mock_job = MagicMock(spec=Job)
    mock_job.id = job_id
    mock_job.cpu_demand = Decimal("2.0")
    mock_job.memory_demand = Decimal("8.0")
    mock_job.base_execution_duration = Decimal("10.0")

    mock_region = MagicMock(spec=Region)
    mock_region.id = region_id
    mock_region.code = "us-east-1"
    mock_region.name = "US East"
    mock_region.provider = "AWS"
    mock_region.max_cpu_capacity = Decimal("32.0")
    mock_region.max_memory_capacity = Decimal("128.0")
    mock_region.current_utilization = Decimal("0.1")
    mock_region.performance_factor = Decimal("1.0")
    mock_region.idle_power_watts = Decimal("100.0")
    mock_region.peak_power_watts = Decimal("400.0")
    mock_region.network_latency_ms = Decimal("10.0")
    mock_region.is_available = True
    mock_region.is_active = True

    mock_attempt = MagicMock(spec=JobAttempt)
    mock_attempt.id = attempt_id
    mock_attempt.job_id = job_id
    mock_attempt.region_id = region_id
    mock_attempt.attempt_number = 1
    mock_attempt.status = AttemptStatus.PENDING.value
    mock_attempt.job = mock_job
    mock_attempt.region = mock_region

    worker = ExecutionWorker(worker_id="test-db-fallback-worker", queue=mock_queue)

    with patch.object(
        JobAttemptRepository,
        "list_pending_stale",
        new=AsyncMock(return_value=[mock_attempt]),
    ), patch.object(
        worker.idempotency_manager,
        "claim_attempt",
        new=AsyncMock(return_value=True),
    ), patch.object(
        worker.idempotency_manager,
        "release_lock",
        new=AsyncMock(),
    ), patch(
        "app.execution.worker.JobAttemptRepository.get_with_relations",
        new=AsyncMock(return_value=mock_attempt),
    ), patch(
        "app.execution.worker.JobAttemptRepository.start_attempt",
        new=AsyncMock(return_value=True),
    ), patch(
        "app.execution.worker.JobAttemptRepository.complete_attempt",
        new=AsyncMock(return_value=True),
    ), patch(
        "app.execution.worker.JobRepository.update_status_conditional",
        new=AsyncMock(return_value=True),
    ), patch(
        "app.execution.worker.AuditEventRepository.record_event",
        new=AsyncMock(),
    ):
        result = await worker.process_one(mock_session)

    assert result == attempt_id


@pytest.mark.asyncio
async def test_duplicate_recovery_and_cas_idempotency():
    """Proves duplicate Redis messages or repeated DB sweeps cannot execute an attempt twice."""
    attempt_id = uuid.uuid4()
    mock_queue = AsyncMock(spec=ExecutionQueue)
    mock_queue.dequeue.return_value = attempt_id

    mock_session = AsyncMock(spec=AsyncSession)

    worker = ExecutionWorker(worker_id="test-cas-worker", queue=mock_queue)

    with patch.object(worker.idempotency_manager, "claim_attempt", new=AsyncMock(return_value=False)):
        # CAS returns False because attempt status is no longer PENDING
        result = await worker.process_one(mock_session)

    assert result is None  # Worker cleanly skips duplicate processing


@pytest.mark.asyncio
async def test_graceful_recovery_loop_shutdown():
    """Verifies run_recovery_loop handles asyncio.CancelledError cleanly on shutdown."""
    mock_dispatcher = AsyncMock(spec=ExecutionDispatcher)
    mock_dispatcher.recover_pending_dispatches.return_value = 0

    with patch("app.main.get_db_sessionmaker", return_value=None):
        task = asyncio.create_task(run_recovery_loop(mock_dispatcher, poll_interval=0.01))
        await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    assert task.done()


@pytest.mark.asyncio
async def test_end_to_end_execution_without_redis(db_session: AsyncSession):
    """E2E test: Job dispatches and executes to COMPLETED when Redis transport fails but PostgreSQL is present."""
    # 1. Create durable Job in DB
    now = datetime.now(timezone.utc)
    job_id = uuid.uuid4()
    db_job = Job(
        id=job_id,
        workload_name="e2e-no-redis-test",
        workload_type=WorkloadType.BATCH.value,
        cpu_demand=Decimal("2.0"),
        memory_demand=Decimal("8.0"),
        base_execution_duration=Decimal("5.0"),
        priority=5,
        deadline=now + timedelta(seconds=300),
        status=JobStatus.PENDING.value,
        current_attempt_count=0,
        max_retries=3,
        created_at=now,
        updated_at=now,
    )
    db_session.add(db_job)
    await db_session.flush()

    # 2. Mock Redis client to simulate Redis failure
    failing_redis = AsyncMock()
    failing_redis.lpush.side_effect = ConnectionError("Redis down")
    failing_redis.brpop.side_effect = ConnectionError("Redis down")
    failing_redis.llen.side_effect = ConnectionError("Redis down")

    queue = ExecutionQueue(redis_client=failing_redis, use_memory_fallback_on_error=True)
    dispatcher = ExecutionDispatcher(queue=queue)

    # Seed a region for dispatching
    reg_id = uuid.uuid4()
    region = Region(
        id=reg_id,
        code=f"e2e-reg-{uuid.uuid4().hex[:4]}",
        name="E2E Test Region",
        provider="AWS",
        country="USA",
        latitude=Decimal("38.000000"),
        longitude=Decimal("-77.000000"),
        max_cpu_capacity=Decimal("64.0"),
        max_memory_capacity=Decimal("256.0"),
        current_utilization=Decimal("0.1"),
        performance_factor=Decimal("1.0"),
        idle_power_watts=Decimal("100.0"),
        peak_power_watts=Decimal("400.0"),
        network_latency_ms=Decimal("10.0"),
        is_available=True,
        is_active=True,
    )
    db_session.add(region)
    await db_session.flush()

    from app.domain.carbon import CarbonQuality, CarbonSource

    decision = SchedulingDecision(
        job_id=job_id,
        decision_action=DecisionAction.EXECUTE,
        carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
        carbon_quality_used=CarbonQuality.LIVE,
        decision_reason="E2E test execute",
        score_breakdown={},
        candidate_rankings=[],
        applied_weights={},
        selected_region_id=reg_id,
        created_at=now,
    )

    # 3. Dispatch decision (enqueues to memory fallback since Redis fails)
    attempt = await dispatcher.dispatch_decision(decision, session=db_session)
    assert attempt is not None
    assert attempt.status == AttemptStatus.PENDING.value

    # 4. Worker executes attempt using memory / DB fallback
    worker = ExecutionWorker(worker_id="e2e-fallback-worker", queue=queue)

    processed_id = await worker.process_one(session=db_session, timeout_seconds=0)
    assert processed_id == attempt.id

    # 5. Verify Job transitioned to COMPLETED in database
    await db_session.refresh(db_job)
    assert db_job.status == JobStatus.COMPLETED.value


@pytest.mark.asyncio
async def test_deferred_job_slack_lifecycle(db_session: AsyncSession):
    """Proves WAITING jobs remain valid while positive deadline slack exists and fail ONLY when exhausted."""
    now = datetime.now(timezone.utc)

    # 1. Test direct DeferralEvaluator slack invariant
    valid_slack = DeadlineSlack(
        deadline=now + timedelta(seconds=600),
        current_time=now,
        estimated_execution_time=Decimal("10.0"),
    )
    assert not valid_slack.is_exhausted
    assert valid_slack.slack_seconds > Decimal("0")

    expired_slack = DeadlineSlack(
        deadline=now - timedelta(seconds=10),
        current_time=now,
        estimated_execution_time=Decimal("10.0"),
    )
    assert expired_slack.is_exhausted
    assert expired_slack.slack_seconds <= Decimal("0")

    # 2. Test empty pool evaluation: slack > 0 yields DEFER; slack <= 0 yields failure (None)
    action_valid, reason_valid = DeferralEvaluator.evaluate_empty_feasible_pool(valid_slack)
    assert action_valid == DecisionAction.DEFER

    action_expired, reason_expired = DeferralEvaluator.evaluate_empty_feasible_pool(expired_slack)
    assert action_expired is None

    # 3. Test DeferredJobEvaluator database sweep behavior
    # Job with expired slack (deadline in past)
    expired_job_id = uuid.uuid4()
    expired_job = Job(
        id=expired_job_id,
        workload_name="expired-waiting-job",
        workload_type=WorkloadType.BATCH.value,
        cpu_demand=Decimal("2.0"),
        memory_demand=Decimal("8.0"),
        base_execution_duration=Decimal("10.0"),
        priority=5,
        deadline=now - timedelta(seconds=10),
        status=JobStatus.WAITING.value,
        current_attempt_count=0,
        max_retries=3,
        created_at=now,
        updated_at=now,
    )
    db_session.add(expired_job)
    await db_session.flush()

    evaluator = DeferredJobEvaluator()
    summary = await evaluator.evaluate_deferred_jobs(session=db_session, current_time=now)

    assert summary["expired"] == 1

    await db_session.refresh(expired_job)
    # Expired job MUST transition to FAILED
    assert expired_job.status == JobStatus.FAILED.value
