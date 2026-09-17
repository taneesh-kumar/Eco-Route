"""Integration tests for Phase 5 end-to-end execution and retry lifecycles."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.decision import SchedulingDecision
from app.domain.values import SchedulingWeights
from app.execution.dispatcher import ExecutionDispatcher
from app.execution.idempotency import IdempotencyManager
from app.execution.queue import ExecutionQueue
from app.execution.retry import RetryManager
from app.execution.worker import ExecutionWorker
from app.persistence.models.enums import AttemptStatus, DecisionAction, JobStatus
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.models.region import Region
from app.scheduling.engine import DecisionEngine


@pytest.mark.asyncio
async def test_full_execution_lifecycle_pipeline():
    """Validates complete flow: Decision -> Dispatcher -> Redis Queue -> Worker -> Completion."""
    job_id = uuid.uuid4()
    region_id = uuid.uuid4()
    attempt_id = uuid.uuid4()

    # In-memory mock Redis list for queue transport
    redis_storage = []

    mock_redis = AsyncMock()

    async def mock_lpush(key, val):
        redis_storage.append(val)
        return len(redis_storage)

    async def mock_brpop(key, timeout=1):
        if redis_storage:
            return (key, redis_storage.pop(0))
        return None

    mock_redis.lpush.side_effect = mock_lpush
    mock_redis.brpop.side_effect = mock_brpop
    mock_redis.set.return_value = True
    mock_redis.eval.return_value = 1

    queue = ExecutionQueue(redis_client=mock_redis)
    dispatcher = ExecutionDispatcher(queue=queue)
    idempotency = IdempotencyManager(redis_client=mock_redis)

    mock_carbon_svc = AsyncMock()
    mock_carbon_svc.get_carbon_intensity.return_value = CarbonIntensity(
        quality=CarbonQuality.LIVE,
        source=CarbonSource.ELECTRICITY_MAPS,
        value=Decimal("180.0"),
    )

    worker = ExecutionWorker(
        worker_id="integration-worker-1",
        queue=queue,
        idempotency_manager=idempotency,
        carbon_service=mock_carbon_svc,
    )

    now = datetime.now(timezone.utc)
    mock_job = MagicMock(spec=Job)
    mock_job.id = job_id
    mock_job.current_attempt_count = 0
    mock_job.max_retries = 3
    mock_job.status = JobStatus.EVALUATING.value
    mock_job.cpu_demand = Decimal("4.0")
    mock_job.memory_demand = Decimal("16.0")
    mock_job.base_execution_duration = Decimal("120.0")

    mock_region = MagicMock(spec=Region)
    mock_region.id = region_id
    mock_region.code = "eu-west-1"
    mock_region.name = "EU West"
    mock_region.provider = "AWS"
    mock_region.max_cpu_capacity = Decimal("32.0")
    mock_region.max_memory_capacity = Decimal("128.0")
    mock_region.current_utilization = Decimal("0.3")
    mock_region.performance_factor = Decimal("1.2")
    mock_region.idle_power_watts = Decimal("120.0")
    mock_region.peak_power_watts = Decimal("450.0")
    mock_region.network_latency_ms = Decimal("25.0")
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

    decision = SchedulingDecision(
        job_id=job_id,
        selected_region_id=region_id,
        decision_action=DecisionAction.EXECUTE,
        carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
        carbon_quality_used=CarbonQuality.LIVE,
        decision_reason="Optimal multi-objective score",
        score_breakdown={},
        candidate_rankings=[],
        applied_weights=SchedulingWeights(Decimal("0.4"), Decimal("0.3"), Decimal("0.2"), Decimal("0.1")),
    )

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_job
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    mock_session.execute.return_value = mock_result

    # 1. Dispatch decision
    with patch("app.execution.dispatcher.AuditEventRepository.record_event", new=AsyncMock()), \
         patch("app.execution.dispatcher.JobAttempt", return_value=mock_attempt):
        dispatched_attempt = await dispatcher.dispatch_decision(decision, session=mock_session)

    assert dispatched_attempt is not None
    assert len(redis_storage) == 1
    assert redis_storage[0] == str(attempt_id)
    assert mock_job.status == JobStatus.DISPATCHED.value

    # 2. Worker processes the attempt from queue
    with patch("app.execution.idempotency.JobAttemptRepository.claim_attempt_atomic", new=AsyncMock(return_value=True)), \
         patch("app.execution.worker.JobAttemptRepository.get_with_relations", new=AsyncMock(return_value=mock_attempt)), \
         patch("app.execution.worker.JobAttemptRepository.start_attempt", new=AsyncMock(return_value=True)), \
         patch("app.execution.worker.JobAttemptRepository.complete_attempt", new=AsyncMock(return_value=True)) as mock_complete, \
         patch("app.execution.worker.JobRepository.update_status_conditional", new=AsyncMock(return_value=True)), \
         patch("app.execution.worker.AuditEventRepository.record_event", new=AsyncMock()):
        processed_id = await worker.process_one(session=mock_session)

    assert processed_id == attempt_id
    assert len(redis_storage) == 0
    mock_complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_failure_and_fresh_reroute_lifecycle():
    """Validates: Failure on Attempt #1 -> RetryManager fresh re-route -> Attempt #2 dispatched."""
    job_id = uuid.uuid4()
    region_a = uuid.uuid4()
    region_b = uuid.uuid4()
    attempt_1_id = uuid.uuid4()
    attempt_2_id = uuid.uuid4()

    mock_queue = AsyncMock(spec=ExecutionQueue)
    mock_queue.dequeue.return_value = attempt_1_id

    mock_idempotency = AsyncMock(spec=IdempotencyManager)
    mock_idempotency.claim_attempt.return_value = True

    now = datetime.now(timezone.utc)
    mock_job = MagicMock(spec=Job)
    mock_job.id = job_id
    mock_job.workload_name = "retry-workload"
    mock_job.workload_type = "BATCH"
    mock_job.cpu_demand = Decimal("4.0")
    mock_job.memory_demand = Decimal("16.0")
    mock_job.base_execution_duration = Decimal("100.0")
    mock_job.priority = 5
    mock_job.deadline = now + timedelta(seconds=1200)
    mock_job.status = JobStatus.RUNNING.value
    mock_job.current_attempt_count = 1
    mock_job.max_retries = 3
    mock_job.created_at = now - timedelta(seconds=100)

    mock_attempt_1 = MagicMock(spec=JobAttempt)
    mock_attempt_1.id = attempt_1_id
    mock_attempt_1.job_id = job_id
    mock_attempt_1.region_id = region_a
    mock_attempt_1.attempt_number = 1
    mock_attempt_1.status = AttemptStatus.RUNNING.value
    mock_attempt_1.job = mock_job

    mock_attempt_2 = MagicMock(spec=JobAttempt)
    mock_attempt_2.id = attempt_2_id
    mock_attempt_2.job_id = job_id
    mock_attempt_2.region_id = region_b
    mock_attempt_2.attempt_number = 2

    # Fresh decision re-routes to region B
    fresh_decision = SchedulingDecision(
        job_id=job_id,
        selected_region_id=region_b,
        decision_action=DecisionAction.EXECUTE,
        carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
        carbon_quality_used=CarbonQuality.LIVE,
        decision_reason="Re-routed to region B under dynamic conditions",
        score_breakdown={},
        candidate_rankings=[],
        applied_weights=SchedulingWeights(Decimal("0.4"), Decimal("0.3"), Decimal("0.2"), Decimal("0.1")),
    )

    mock_engine = AsyncMock(spec=DecisionEngine)
    mock_engine.schedule.return_value = fresh_decision

    mock_dispatcher = AsyncMock(spec=ExecutionDispatcher)
    mock_dispatcher.dispatch_decision.return_value = mock_attempt_2

    retry_mgr = RetryManager(
        decision_engine=mock_engine,
        dispatcher=mock_dispatcher,
    )

    worker = ExecutionWorker(
        worker_id="integration-worker-retry",
        queue=mock_queue,
        idempotency_manager=mock_idempotency,
        retry_manager=retry_mgr,
    )

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_job
    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result

    with patch("app.execution.worker.JobAttemptRepository.get_with_relations", new=AsyncMock(return_value=mock_attempt_1)), \
         patch("app.execution.worker.JobAttemptRepository.start_attempt", new=AsyncMock(return_value=True)), \
         patch("app.execution.worker.JobRepository.update_status_conditional", new=AsyncMock(return_value=True)), \
         patch("app.execution.worker.AuditEventRepository.record_event", new=AsyncMock()), \
         patch("app.execution.retry.JobAttemptRepository.get_with_relations", new=AsyncMock(return_value=mock_attempt_1)), \
         patch("app.execution.retry.JobAttemptRepository.fail_attempt", new=AsyncMock(return_value=True)), \
         patch("app.execution.retry.AuditEventRepository.record_event", new=AsyncMock()):

        # Worker processes attempt 1 with failure injected
        processed_id = await worker.process_one(
            session=mock_session,
            simulate_failure=True,
            failure_error_message="Simulated node degradation in region A",
        )

    assert processed_id == attempt_1_id
    # Verifies fresh routing was called with DecisionEngine
    mock_engine.schedule.assert_awaited_once()
    # Verifies attempt #2 was dispatched to region B
    mock_dispatcher.dispatch_decision.assert_awaited_once_with(
        decision=fresh_decision, session=mock_session
    )
