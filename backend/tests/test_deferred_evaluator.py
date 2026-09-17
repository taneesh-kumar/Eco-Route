"""Unit tests for DeferredJobEvaluator."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.domain.carbon import CarbonQuality, CarbonSource
from app.domain.decision import SchedulingDecision
from app.domain.values import SchedulingWeights
from app.execution.deferral_evaluator import DeferredJobEvaluator
from app.execution.dispatcher import ExecutionDispatcher
from app.persistence.models.enums import DecisionAction, JobStatus
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.scheduling.engine import DecisionEngine


@pytest.mark.asyncio
async def test_deferred_evaluator_dispatches_when_execute_favorable():
    now = datetime.now(timezone.utc)
    mock_job = MagicMock(spec=Job)
    mock_job.id = uuid.uuid4()
    mock_job.workload_name = "waiting-job"
    mock_job.workload_type = "BATCH"
    mock_job.cpu_demand = Decimal("4.0")
    mock_job.memory_demand = Decimal("16.0")
    mock_job.base_execution_duration = Decimal("100.0")
    mock_job.priority = 5
    mock_job.deadline = now + timedelta(seconds=1000)  # Positive slack
    mock_job.status = JobStatus.WAITING.value
    mock_job.current_attempt_count = 0
    mock_job.max_retries = 3
    mock_job.created_at = now - timedelta(seconds=300)

    mock_engine = AsyncMock(spec=DecisionEngine)
    execute_decision = SchedulingDecision(
        job_id=mock_job.id,
        selected_region_id=uuid.uuid4(),
        decision_action=DecisionAction.EXECUTE,
        carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
        carbon_quality_used=CarbonQuality.LIVE,
        decision_reason="Favorable grid conditions materialized",
        score_breakdown={},
        candidate_rankings=[],
        applied_weights=SchedulingWeights(Decimal("0.4"), Decimal("0.3"), Decimal("0.2"), Decimal("0.1")),
    )
    mock_engine.schedule.return_value = execute_decision

    mock_dispatcher = AsyncMock(spec=ExecutionDispatcher)
    mock_attempt = MagicMock(spec=JobAttempt)
    mock_dispatcher.dispatch_decision.return_value = mock_attempt

    evaluator = DeferredJobEvaluator(
        decision_engine=mock_engine,
        dispatcher=mock_dispatcher,
    )

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_job]
    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result

    with patch("app.execution.deferral_evaluator.AuditEventRepository.record_event", new=AsyncMock()):
        summary = await evaluator.evaluate_deferred_jobs(mock_session, current_time=now)

    assert summary["evaluated"] == 1
    assert summary["dispatched"] == 1
    assert summary["expired"] == 0
    mock_dispatcher.dispatch_decision.assert_awaited_once_with(execute_decision, session=mock_session)


@pytest.mark.asyncio
async def test_deferred_evaluator_expires_depleted_slack_job():
    now = datetime.now(timezone.utc)
    mock_job = MagicMock(spec=Job)
    mock_job.id = uuid.uuid4()
    mock_job.workload_name = "expired-job"
    mock_job.workload_type = "BATCH"
    mock_job.cpu_demand = Decimal("4.0")
    mock_job.memory_demand = Decimal("16.0")
    mock_job.base_execution_duration = Decimal("300.0")
    mock_job.priority = 5
    # Deadline is only 100s away, but duration is 300s -> Slack is -200s
    mock_job.deadline = now + timedelta(seconds=100)
    mock_job.status = JobStatus.WAITING.value
    mock_job.current_attempt_count = 0
    mock_job.max_retries = 3
    mock_job.created_at = now - timedelta(seconds=600)

    mock_engine = AsyncMock(spec=DecisionEngine)
    evaluator = DeferredJobEvaluator(decision_engine=mock_engine)

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_job]
    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result

    with patch("app.execution.deferral_evaluator.AuditEventRepository.record_event", new=AsyncMock()):
        summary = await evaluator.evaluate_deferred_jobs(mock_session, current_time=now)

    assert summary["evaluated"] == 1
    assert summary["dispatched"] == 0
    assert summary["expired"] == 1
    assert mock_job.status == JobStatus.FAILED.value
    mock_engine.schedule.assert_not_called()
