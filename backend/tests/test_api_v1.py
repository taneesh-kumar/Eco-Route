"""Comprehensive tests for Phase 6 REST API endpoints."""

from datetime import datetime, timezone
from decimal import Decimal
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import ASGITransport, AsyncClient
import pytest

from app.api.schemas.analytics import AnalyticsSummaryResponse
from app.db.session import get_db_session
from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.decision import SchedulingDecision
from app.domain.values import SchedulingWeights
from app.main import app
from app.persistence.models.audit_event import AuditEvent
from app.persistence.models.enums import AttemptStatus, DecisionAction, JobStatus
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.models.region import Region
from app.persistence.models.scheduling_decision import SchedulingDecision as DbSchedulingDecision


@pytest.fixture
def mock_db_session():
    session = AsyncMock()
    return session


@pytest.fixture
def override_db(mock_db_session):
    app.dependency_overrides[get_db_session] = lambda: mock_db_session
    yield mock_db_session
    app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_api_submit_workload_success(override_db):
    transport = ASGITransport(app=app)
    job_id = uuid.uuid4()
    region_id = uuid.uuid4()

    mock_db_job = MagicMock(spec=Job)
    mock_db_job.id = job_id
    mock_db_job.workload_name = "test-inference-01"
    mock_db_job.workload_type = "INFERENCE"
    mock_db_job.cpu_demand = Decimal("2.0")
    mock_db_job.memory_demand = Decimal("8.0")
    mock_db_job.base_execution_duration = Decimal("30.0")
    mock_db_job.priority = 5
    mock_db_job.deadline = datetime.now(timezone.utc)
    mock_db_job.status = JobStatus.DISPATCHED.value
    mock_db_job.current_attempt_count = 1
    mock_db_job.max_retries = 3
    mock_db_job.created_at = datetime.now(timezone.utc)
    mock_db_job.updated_at = datetime.now(timezone.utc)

    decision = SchedulingDecision(
        job_id=job_id,
        selected_region_id=region_id,
        decision_action=DecisionAction.EXECUTE,
        carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
        carbon_quality_used=CarbonQuality.LIVE,
        decision_reason="Selected optimal region",
        score_breakdown={},
        candidate_rankings=[],
        applied_weights=SchedulingWeights(Decimal("0.4"), Decimal("0.3"), Decimal("0.2"), Decimal("0.1")),
    )

    mock_attempt = MagicMock(spec=JobAttempt)
    mock_attempt.id = uuid.uuid4()

    payload = {
        "workload_name": "test-inference-01",
        "workload_type": "INFERENCE",
        "cpu_demand": 2.0,
        "memory_demand": 8.0,
        "base_execution_duration": 30.0,
        "priority": 5,
        "deadline": "2026-10-01T12:00:00Z",
        "scheduler_variant": "ECOROUTE",
    }

    with patch(
        "app.api.v1.jobs._job_service.submit_workload",
        new=AsyncMock(return_value=(mock_db_job, decision, mock_attempt)),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post("/api/v1/jobs", json=payload)

    assert res.status_code == 201
    data = res.json()
    assert data["job"]["workload_name"] == "test-inference-01"
    assert data["decision_action"] == "EXECUTE"
    assert data["selected_region_id"] == str(region_id)
    assert data["dispatched_attempt_id"] == str(mock_attempt.id)


@pytest.mark.asyncio
async def test_api_submit_workload_validation_error():
    transport = ASGITransport(app=app)
    # Invalid: cpu_demand <= 0, priority > 10
    payload = {
        "workload_name": "invalid-job",
        "workload_type": "BATCH",
        "cpu_demand": -1.0,
        "memory_demand": 8.0,
        "base_execution_duration": 30.0,
        "priority": 99,
        "deadline": "2026-10-01T12:00:00Z",
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/v1/jobs", json=payload)

    assert res.status_code == 422


@pytest.mark.asyncio
async def test_api_get_job_not_found(override_db):
    transport = ASGITransport(app=app)
    job_id = uuid.uuid4()

    with patch(
        "app.api.v1.jobs._job_service.get_job",
        new=AsyncMock(return_value=None),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(f"/api/v1/jobs/{job_id}")

    assert res.status_code == 404


@pytest.mark.asyncio
async def test_api_cancel_job(override_db):
    transport = ASGITransport(app=app)
    job_id = uuid.uuid4()

    with patch(
        "app.api.v1.jobs._job_service.cancel_job",
        new=AsyncMock(return_value=True),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(f"/api/v1/jobs/{job_id}/cancel")

    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_api_get_scheduling_decision_explainability(override_db):
    transport = ASGITransport(app=app)
    decision_id = uuid.uuid4()
    job_id = uuid.uuid4()
    region_id = uuid.uuid4()

    mock_decision = MagicMock(spec=DbSchedulingDecision)
    mock_decision.id = decision_id
    mock_decision.job_id = job_id
    mock_decision.attempt_id = None
    mock_decision.selected_region_id = region_id
    mock_decision.decision_action = "EXECUTE"
    mock_decision.cost_score_jr = Decimal("0.345678")
    mock_decision.estimated_energy_kwh = Decimal("0.005000")
    mock_decision.estimated_co2eq_grams = Decimal("0.7500")
    mock_decision.carbon_source_used = "ELECTRICITY_MAPS"
    mock_decision.carbon_quality_used = "LIVE"
    mock_decision.decision_reason = "Lowest composite score"
    mock_decision.score_breakdown = {"duration": 100}
    mock_decision.candidate_rankings = [{"region": "eu-west-1", "score": 0.34}]
    mock_decision.applied_weights = {"wC": 0.4, "wT": 0.3, "wU": 0.2, "wL": 0.1}
    mock_decision.normalization_factors = {"duration_min": 50, "duration_max": 200}
    mock_decision.created_at = datetime.now(timezone.utc)

    with patch(
        "app.api.v1.scheduling._scheduling_service.get_decision",
        new=AsyncMock(return_value=mock_decision),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(f"/api/v1/scheduling/decisions/{decision_id}")

    assert res.status_code == 200
    data = res.json()
    assert data["decision_action"] == "EXECUTE"
    assert data["applied_weights"]["wC"] == 0.4
    assert len(data["candidate_rankings"]) == 1


@pytest.mark.asyncio
async def test_api_evaluate_deferred(override_db):
    transport = ASGITransport(app=app)

    with patch(
        "app.api.v1.scheduling._scheduling_service.evaluate_deferred",
        new=AsyncMock(return_value={"evaluated": 2, "dispatched": 1, "expired": 0, "remained_waiting": 1}),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post("/api/v1/scheduling/evaluate-deferred")

    assert res.status_code == 200
    assert res.json()["summary"]["dispatched"] == 1


@pytest.mark.asyncio
async def test_api_list_regions(override_db):
    transport = ASGITransport(app=app)
    mock_region = MagicMock(spec=Region)
    mock_region.id = uuid.uuid4()
    mock_region.code = "us-east-1"
    mock_region.name = "US East"
    mock_region.provider = "AWS"
    mock_region.country = "USA"
    mock_region.latitude = Decimal("38.0")
    mock_region.longitude = Decimal("-78.0")
    mock_region.max_cpu_capacity = Decimal("64.0")
    mock_region.max_memory_capacity = Decimal("256.0")
    mock_region.current_utilization = Decimal("0.45")
    mock_region.performance_factor = Decimal("1.0")
    mock_region.idle_power_watts = Decimal("100.0")
    mock_region.peak_power_watts = Decimal("500.0")
    mock_region.network_latency_ms = Decimal("15.0")
    mock_region.is_available = True
    mock_region.is_active = True

    with patch(
        "app.api.v1.regions.RegionRepository.list_active",
        new=AsyncMock(return_value=[mock_region]),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/regions")

    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["code"] == "us-east-1"


@pytest.mark.asyncio
async def test_api_get_current_carbon_zero_fabrication(override_db):
    transport = ASGITransport(app=app)
    region_id = uuid.uuid4()

    mock_region = MagicMock(spec=Region)
    mock_region.id = region_id
    mock_region.code = "eu-north-1"
    mock_region.name = "EU North"
    mock_region.provider = "AWS"
    mock_region.max_cpu_capacity = Decimal("32.0")
    mock_region.max_memory_capacity = Decimal("128.0")
    mock_region.current_utilization = Decimal("0.2")
    mock_region.performance_factor = Decimal("1.0")
    mock_region.idle_power_watts = Decimal("80.0")
    mock_region.peak_power_watts = Decimal("350.0")
    mock_region.network_latency_ms = Decimal("30.0")
    mock_region.is_available = True
    mock_region.is_active = True

    # Unavailable carbon
    unavail_carbon = CarbonIntensity(
        quality=CarbonQuality.UNAVAILABLE,
        source=CarbonSource.ELECTRICITY_MAPS,
        value=None,
    )

    with patch(
        "app.api.v1.carbon.RegionRepository.get_by_id",
        new=AsyncMock(return_value=mock_region),
    ), patch(
        "app.api.v1.carbon._carbon_service.get_carbon_intensity",
        new=AsyncMock(return_value=unavail_carbon),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(f"/api/v1/carbon/regions/{region_id}/current")

    assert res.status_code == 200
    data = res.json()
    assert data["carbon_intensity"] is None
    assert data["data_quality"] == "UNAVAILABLE"
    assert data["is_trustworthy"] is False


@pytest.mark.asyncio
async def test_api_analytics_summary(override_db):
    transport = ASGITransport(app=app)
    mock_summary = AnalyticsSummaryResponse(
        total_jobs=10,
        completed_jobs=8,
        failed_jobs=1,
        waiting_jobs=1,
        total_energy_kwh=Decimal("0.045000"),
        total_co2eq_grams=Decimal("5.6250"),
        counterfactual_carbon_reduction_pct=None,
        sla_compliance_rate=Decimal("1.0000"),
        deferral_rate=Decimal("0.1000"),
        failure_rate=Decimal("0.1000"),
        retry_rate=Decimal("0.1000"),
    )

    with patch(
        "app.api.v1.analytics._analytics_service.get_summary",
        new=AsyncMock(return_value=mock_summary),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/analytics/summary")

    assert res.status_code == 200
    data = res.json()
    assert data["completed_jobs"] == 8
    assert data["total_energy_kwh"] == "0.045000"
    assert data["counterfactual_carbon_reduction_pct"] is None
