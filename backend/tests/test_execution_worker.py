"""Unit tests for ExecutionWorker and ExecutionTelemetry."""

from decimal import Decimal
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.carbon.service import CarbonService
from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.region import Region as DomainRegion
from app.domain.values import WorkloadDemand
from app.execution.idempotency import IdempotencyManager
from app.execution.queue import ExecutionQueue
from app.execution.retry import RetryManager
from app.execution.telemetry import ExecutionTelemetry
from app.execution.worker import ExecutionWorker
from app.persistence.models.enums import AttemptStatus, JobStatus
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.models.region import Region


def test_execution_telemetry_with_valid_carbon():
    demand = WorkloadDemand(
        cpu_demand=Decimal("4.0"),
        memory_demand=Decimal("16.0"),
        base_execution_duration=Decimal("300.0"),
    )
    region = DomainRegion(
        id=uuid.uuid4(),
        code="us-east-1",
        name="US East",
        provider="AWS",
        max_cpu_capacity=Decimal("32.0"),
        max_memory_capacity=Decimal("128.0"),
        current_utilization=Decimal("0.5"),
        performance_factor=Decimal("1.5"),
        idle_power_watts=Decimal("100.0"),
        peak_power_watts=Decimal("500.0"),
        network_latency_ms=Decimal("20.0"),
    )
    carbon = CarbonIntensity(
        quality=CarbonQuality.LIVE,
        source=CarbonSource.ELECTRICITY_MAPS,
        value=Decimal("200.0"),
    )

    telemetry = ExecutionTelemetry.calculate_observed(demand, region, carbon)

    # Duration = 300 / 1.5 = 200.00
    assert telemetry.actual_duration_seconds == Decimal("200.00")
    # deltaP = (500 - 100) * (4 / 32) = 400 * 0.125 = 50.00 W
    # energy = 50 * 200 / 3,600,000 = 10000 / 3600000 = 0.002778 kWh
    assert telemetry.actual_energy_kwh == Decimal("0.002778")
    # co2 = 0.002778 * 200 = 0.5556 g
    assert telemetry.actual_co2eq_grams == Decimal("0.5556")
    assert telemetry.carbon_quality_used == CarbonQuality.LIVE


def test_execution_telemetry_zero_carbon_fabrication():
    demand = WorkloadDemand(
        cpu_demand=Decimal("4.0"),
        memory_demand=Decimal("16.0"),
        base_execution_duration=Decimal("300.0"),
    )
    region = DomainRegion(
        id=uuid.uuid4(),
        code="eu-west-1",
        name="EU West",
        provider="AWS",
        max_cpu_capacity=Decimal("32.0"),
        max_memory_capacity=Decimal("128.0"),
        current_utilization=Decimal("0.5"),
        performance_factor=Decimal("1.0"),
        idle_power_watts=Decimal("100.0"),
        peak_power_watts=Decimal("500.0"),
        network_latency_ms=Decimal("20.0"),
    )
    # Carbon is UNAVAILABLE
    carbon = CarbonIntensity(
        quality=CarbonQuality.UNAVAILABLE,
        source=CarbonSource.ELECTRICITY_MAPS,
        value=None,
    )

    telemetry = ExecutionTelemetry.calculate_observed(demand, region, carbon)

    assert telemetry.actual_duration_seconds == Decimal("300.00")
    assert telemetry.actual_energy_kwh > Decimal("0")
    # Emissions MUST be None when carbon is unavailable
    assert telemetry.actual_co2eq_grams is None
    assert telemetry.carbon_quality_used == CarbonQuality.UNAVAILABLE


@pytest.mark.asyncio
async def test_worker_process_one_success():
    attempt_id = uuid.uuid4()
    mock_queue = AsyncMock(spec=ExecutionQueue)
    mock_queue.dequeue.return_value = attempt_id

    mock_idempotency = AsyncMock(spec=IdempotencyManager)
    mock_idempotency.claim_attempt.return_value = True

    mock_carbon_svc = AsyncMock(spec=CarbonService)
    mock_carbon_svc.get_carbon_intensity.return_value = CarbonIntensity(
        quality=CarbonQuality.LIVE,
        source=CarbonSource.ELECTRICITY_MAPS,
        value=Decimal("150.0"),
    )

    mock_retry_mgr = AsyncMock(spec=RetryManager)

    worker = ExecutionWorker(
        worker_id="test-worker",
        queue=mock_queue,
        idempotency_manager=mock_idempotency,
        carbon_service=mock_carbon_svc,
        retry_manager=mock_retry_mgr,
    )

    # Setup mock attempt with relations
    mock_job = MagicMock(spec=Job)
    mock_job.id = uuid.uuid4()
    mock_job.cpu_demand = Decimal("2.0")
    mock_job.memory_demand = Decimal("8.0")
    mock_job.base_execution_duration = Decimal("100.0")

    mock_region = MagicMock(spec=Region)
    mock_region.id = uuid.uuid4()
    mock_region.code = "us-east-1"
    mock_region.name = "US East"
    mock_region.provider = "AWS"
    mock_region.max_cpu_capacity = Decimal("32.0")
    mock_region.max_memory_capacity = Decimal("128.0")
    mock_region.current_utilization = Decimal("0.2")
    mock_region.performance_factor = Decimal("1.0")
    mock_region.idle_power_watts = Decimal("100.0")
    mock_region.peak_power_watts = Decimal("400.0")
    mock_region.network_latency_ms = Decimal("10.0")
    mock_region.is_available = True
    mock_region.is_active = True

    mock_attempt = MagicMock(spec=JobAttempt)
    mock_attempt.id = attempt_id
    mock_attempt.job_id = mock_job.id
    mock_attempt.region_id = mock_region.id
    mock_attempt.attempt_number = 1
    mock_attempt.job = mock_job
    mock_attempt.region = mock_region

    mock_session = AsyncMock()

    with patch(
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
    mock_idempotency.claim_attempt.assert_awaited_once()
    mock_idempotency.release_lock.assert_awaited_once_with(attempt_id, "test-worker")


@pytest.mark.asyncio
async def test_worker_process_one_empty_queue():
    mock_queue = AsyncMock(spec=ExecutionQueue)
    mock_queue.dequeue.return_value = None

    worker = ExecutionWorker(queue=mock_queue)
    mock_session = AsyncMock()

    assert await worker.process_one(mock_session) is None


@pytest.mark.asyncio
async def test_worker_process_one_failure_injection_triggers_retry():
    attempt_id = uuid.uuid4()
    mock_queue = AsyncMock(spec=ExecutionQueue)
    mock_queue.dequeue.return_value = attempt_id

    mock_idempotency = AsyncMock(spec=IdempotencyManager)
    mock_idempotency.claim_attempt.return_value = True

    mock_retry_mgr = AsyncMock(spec=RetryManager)

    worker = ExecutionWorker(
        worker_id="test-worker",
        queue=mock_queue,
        idempotency_manager=mock_idempotency,
        retry_manager=mock_retry_mgr,
    )

    mock_attempt = MagicMock(spec=JobAttempt)
    mock_attempt.id = attempt_id
    mock_attempt.job_id = uuid.uuid4()
    mock_attempt.attempt_number = 1

    mock_session = AsyncMock()

    with patch(
        "app.execution.worker.JobAttemptRepository.get_with_relations",
        new=AsyncMock(return_value=mock_attempt),
    ), patch(
        "app.execution.worker.JobAttemptRepository.start_attempt",
        new=AsyncMock(return_value=True),
    ), patch(
        "app.execution.worker.JobRepository.update_status_conditional",
        new=AsyncMock(return_value=True),
    ), patch(
        "app.execution.worker.AuditEventRepository.record_event",
        new=AsyncMock(),
    ):
        result = await worker.process_one(
            session=mock_session,
            simulate_failure=True,
            failure_error_message="Node crash injection",
        )

    assert result == attempt_id
    mock_retry_mgr.handle_attempt_failure.assert_awaited_once()
