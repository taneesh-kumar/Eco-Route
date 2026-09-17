"""Unit tests for ExecutionDispatcher and dispatch recovery."""

from decimal import Decimal
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.domain.carbon import CarbonQuality, CarbonSource
from app.domain.decision import SchedulingDecision
from app.domain.exceptions import RetryBudgetExhaustedError
from app.domain.values import SchedulingWeights
from app.execution.dispatcher import ExecutionDispatcher
from app.execution.queue import ExecutionQueue
from app.persistence.models.enums import AttemptStatus, DecisionAction, JobStatus
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt


@pytest.fixture
def sample_decision():
    return SchedulingDecision(
        job_id=uuid.uuid4(),
        selected_region_id=uuid.uuid4(),
        decision_action=DecisionAction.EXECUTE,
        carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
        carbon_quality_used=CarbonQuality.LIVE,
        decision_reason="Lowest composite cost score",
        score_breakdown={"duration": 100},
        candidate_rankings=[],
        applied_weights=SchedulingWeights(Decimal("0.4"), Decimal("0.3"), Decimal("0.2"), Decimal("0.1")),
    )


@pytest.fixture
def defer_decision():
    return SchedulingDecision(
        job_id=uuid.uuid4(),
        selected_region_id=None,
        decision_action=DecisionAction.DEFER,
        carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
        carbon_quality_used=CarbonQuality.UNAVAILABLE,
        decision_reason="Verified forecast opportunity available",
        score_breakdown={},
        candidate_rankings=[],
        applied_weights=SchedulingWeights(Decimal("0.0"), Decimal("0.5"), Decimal("0.3"), Decimal("0.2")),
    )


@pytest.mark.asyncio
async def test_dispatcher_defer_does_not_create_attempt(defer_decision):
    mock_queue = AsyncMock(spec=ExecutionQueue)
    dispatcher = ExecutionDispatcher(queue=mock_queue)
    mock_session = AsyncMock()

    result = await dispatcher.dispatch_decision(defer_decision, session=mock_session)
    assert result is None
    mock_queue.enqueue.assert_not_called()


@pytest.mark.asyncio
async def test_dispatcher_execute_creates_monotonic_attempt(sample_decision):
    mock_queue = AsyncMock(spec=ExecutionQueue)
    mock_queue.enqueue.return_value = True

    dispatcher = ExecutionDispatcher(queue=mock_queue)

    mock_job = MagicMock(spec=Job)
    mock_job.id = sample_decision.job_id
    mock_job.current_attempt_count = 0
    mock_job.max_retries = 3

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_job
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    mock_session.execute.return_value = mock_result

    with patch("app.execution.dispatcher.AuditEventRepository.record_event", new=AsyncMock()):
        attempt = await dispatcher.dispatch_decision(sample_decision, session=mock_session)

    assert attempt is not None
    assert attempt.attempt_number == 1
    assert attempt.status == AttemptStatus.PENDING.value
    assert attempt.region_id == sample_decision.selected_region_id
    assert mock_job.current_attempt_count == 1
    assert mock_job.status == JobStatus.DISPATCHED.value
    mock_session.add.assert_called_once_with(attempt)
    mock_queue.enqueue.assert_awaited_once_with(attempt.id)


@pytest.mark.asyncio
async def test_dispatcher_exhausted_retry_budget_raises(sample_decision):
    mock_queue = AsyncMock(spec=ExecutionQueue)
    dispatcher = ExecutionDispatcher(queue=mock_queue)

    mock_job = MagicMock(spec=Job)
    mock_job.id = sample_decision.job_id
    mock_job.current_attempt_count = 3
    mock_job.max_retries = 3

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_job
    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result

    with pytest.raises(RetryBudgetExhaustedError):
        await dispatcher.dispatch_decision(sample_decision, session=mock_session)

    mock_queue.enqueue.assert_not_called()


@pytest.mark.asyncio
async def test_dispatcher_recover_pending_dispatches():
    mock_queue = AsyncMock(spec=ExecutionQueue)
    mock_queue.enqueue.return_value = True

    dispatcher = ExecutionDispatcher(queue=mock_queue)

    att1 = MagicMock(spec=JobAttempt)
    att1.id = uuid.uuid4()
    att1.job_id = uuid.uuid4()

    att2 = MagicMock(spec=JobAttempt)
    att2.id = uuid.uuid4()
    att2.job_id = uuid.uuid4()

    mock_session = AsyncMock()

    with patch(
        "app.execution.dispatcher.JobAttemptRepository.list_pending_stale",
        new=AsyncMock(return_value=[att1, att2]),
    ):
        recovered = await dispatcher.recover_pending_dispatches(
            session=mock_session, older_than_seconds=5
        )

    assert recovered == 2
    assert mock_queue.enqueue.await_count == 2
