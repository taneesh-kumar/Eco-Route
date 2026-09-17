"""Unit tests for RetryManager fresh routing and budget enforcement."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.domain.carbon import CarbonQuality, CarbonSource
from app.domain.decision import SchedulingDecision
from app.domain.values import SchedulingWeights
from app.execution.dispatcher import ExecutionDispatcher
from app.execution.retry import RetryManager
from app.persistence.models.enums import AttemptStatus, DecisionAction, JobStatus
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.scheduling.engine import DecisionEngine


@pytest.fixture
def mock_failed_attempt():
    att = MagicMock(spec=JobAttempt)
    att.id = uuid.uuid4()
    att.job_id = uuid.uuid4()
    att.attempt_number = 1
    att.status = AttemptStatus.RUNNING.value
    return att


@pytest.mark.asyncio
async def test_retry_manager_triggers_fresh_routing(mock_failed_attempt):
    now = datetime.now(timezone.utc)
    mock_job = MagicMock(spec=Job)
    mock_job.id = mock_failed_attempt.job_id
    mock_job.workload_name = "test-workload"
    mock_job.workload_type = "BATCH"
    mock_job.cpu_demand = Decimal("4.0")
    mock_job.memory_demand = Decimal("16.0")
    mock_job.base_execution_duration = Decimal("100.0")
    mock_job.priority = 5
    mock_job.deadline = now + timedelta(seconds=1000)  # Generous slack
    mock_job.status = JobStatus.RUNNING.value
    mock_job.current_attempt_count = 1
    mock_job.max_retries = 3
    mock_job.created_at = now - timedelta(seconds=200)

    mock_engine = AsyncMock(spec=DecisionEngine)
    fresh_decision = SchedulingDecision(
        job_id=mock_job.id,
        selected_region_id=uuid.uuid4(),
        decision_action=DecisionAction.EXECUTE,
        carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
        carbon_quality_used=CarbonQuality.LIVE,
        decision_reason="Re-routed to greener region",
        score_breakdown={},
        candidate_rankings=[],
        applied_weights=SchedulingWeights(Decimal("0.4"), Decimal("0.3"), Decimal("0.2"), Decimal("0.1")),
    )
    mock_engine.schedule.return_value = fresh_decision

    mock_dispatcher = AsyncMock(spec=ExecutionDispatcher)
    mock_new_attempt = MagicMock(spec=JobAttempt)
    mock_new_attempt.id = uuid.uuid4()
    mock_new_attempt.attempt_number = 2
    mock_dispatcher.dispatch_decision.return_value = mock_new_attempt

    retry_mgr = RetryManager(
        decision_engine=mock_engine,
        dispatcher=mock_dispatcher,
    )

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_job
    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result

    with patch(
        "app.execution.retry.JobAttemptRepository.get_with_relations",
        new=AsyncMock(return_value=mock_failed_attempt),
    ), patch(
        "app.execution.retry.JobAttemptRepository.fail_attempt",
        new=AsyncMock(return_value=True),
    ), patch(
        "app.execution.retry.AuditEventRepository.record_event",
        new=AsyncMock(),
    ):
        result = await retry_mgr.handle_attempt_failure(
            attempt_id=mock_failed_attempt.id,
            error_message="Node timeout",
            session=mock_session,
            current_time=now,
        )

    assert result == mock_new_attempt
    # Fresh scheduling must be invoked
    mock_engine.schedule.assert_awaited_once()
    mock_dispatcher.dispatch_decision.assert_awaited_once_with(
        decision=fresh_decision, session=mock_session
    )


@pytest.mark.asyncio
async def test_retry_manager_exhausted_budget_marks_job_failed(mock_failed_attempt):
    now = datetime.now(timezone.utc)
    mock_job = MagicMock(spec=Job)
    mock_job.id = mock_failed_attempt.job_id
    mock_job.workload_name = "test-workload"
    mock_job.workload_type = "BATCH"
    mock_job.cpu_demand = Decimal("4.0")
    mock_job.memory_demand = Decimal("16.0")
    mock_job.base_execution_duration = Decimal("100.0")
    mock_job.priority = 5
    mock_job.deadline = now + timedelta(seconds=1000)
    mock_job.status = JobStatus.RUNNING.value
    # Budget of 2 is already reached (Attempt 1 + Attempt 2)
    mock_job.current_attempt_count = 2
    mock_job.max_retries = 2
    mock_job.created_at = now - timedelta(seconds=200)

    mock_engine = AsyncMock(spec=DecisionEngine)
    retry_mgr = RetryManager(decision_engine=mock_engine)

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_job
    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result

    with patch(
        "app.execution.retry.JobAttemptRepository.get_with_relations",
        new=AsyncMock(return_value=mock_failed_attempt),
    ), patch(
        "app.execution.retry.JobAttemptRepository.fail_attempt",
        new=AsyncMock(return_value=True),
    ), patch(
        "app.execution.retry.AuditEventRepository.record_event",
        new=AsyncMock(),
    ):
        result = await retry_mgr.handle_attempt_failure(
            attempt_id=mock_failed_attempt.id,
            error_message="Hard failure",
            session=mock_session,
            current_time=now,
        )

    assert result is None
    assert mock_job.status == JobStatus.FAILED.value
    mock_engine.schedule.assert_not_called()
