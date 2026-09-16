import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
import pytest_asyncio
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_sessionmaker
from app.persistence.models import (
    Job,
    JobAttempt,
    Region,
    CarbonObservation,
    SchedulingDecision,
    Experiment,
    ExperimentResult,
    AuditEvent,
    JobStatus,
    AttemptStatus,
    DecisionAction,
    CarbonDataQuality,
    CarbonSource,
    SchedulerVariant,
)
from app.persistence.repositories import JobRepository, RegionRepository


@pytest.mark.asyncio
async def test_region_persistence(db_session: AsyncSession):
    code = f"test-region-{uuid.uuid4().hex[:6]}"
    region = Region(
        code=code,
        name="Test Region East",
        provider="AWS",
        country="USA",
        latitude=Decimal("38.130000"),
        longitude=Decimal("-78.450000"),
        max_cpu_capacity=Decimal("500.00"),
        max_memory_capacity=Decimal("2000.00"),
        current_utilization=Decimal("0.2500"),
        performance_factor=Decimal("1.0000"),
        idle_power_watts=Decimal("80.00"),
        peak_power_watts=Decimal("350.00"),
        network_latency_ms=Decimal("12.50"),
    )
    repo = RegionRepository(db_session)
    saved = await repo.create(region)
    await db_session.commit()

    try:
        fetched = await repo.get_by_code(code)
        assert fetched is not None
        assert fetched.id == saved.id
        assert fetched.provider == "AWS"
        assert fetched.max_cpu_capacity == Decimal("500.00")
        assert fetched.is_available is True
    finally:
        # Cleanup
        await db_session.delete(saved)
        await db_session.commit()


@pytest.mark.asyncio
async def test_job_and_attempt_persistence(db_session: AsyncSession):
    # Setup test region
    region_code = f"test-reg-{uuid.uuid4().hex[:6]}"
    region = Region(
        code=region_code,
        name="Compute Cluster 1",
        provider="GCP",
        country="Germany",
        latitude=Decimal("50.110900"),
        longitude=Decimal("8.682100"),
        max_cpu_capacity=Decimal("100.00"),
        max_memory_capacity=Decimal("400.00"),
        idle_power_watts=Decimal("50.00"),
        peak_power_watts=Decimal("200.00"),
    )
    db_session.add(region)
    await db_session.flush()

    job_repo = JobRepository(db_session)
    deadline = datetime.now(timezone.utc) + timedelta(hours=3)
    job = Job(
        workload_name="genomic-pipeline-42",
        workload_type="BATCH",
        cpu_demand=Decimal("8.00"),
        memory_demand=Decimal("32.00"),
        base_execution_duration=Decimal("600.00"),
        priority=7,
        deadline=deadline,
        status=JobStatus.PENDING.value,
    )
    await job_repo.create(job)
    await db_session.commit()

    try:
        # Verify job was persisted
        fetched_job = await job_repo.get_by_id(job.id)
        assert fetched_job is not None
        assert fetched_job.workload_name == "genomic-pipeline-42"
        assert fetched_job.status == JobStatus.PENDING.value

        # Test generic conditional update primitive
        updated = await job_repo.update_status_conditional(
            job.id,
            from_status=JobStatus.PENDING.value,
            to_status=JobStatus.EVALUATING.value,
        )
        assert updated is True
        await db_session.commit()

        re_fetched = await job_repo.get_by_id(job.id)
        assert re_fetched.status == JobStatus.EVALUATING.value

        # False condition
        failed_update = await job_repo.update_status_conditional(
            job.id,
            from_status=JobStatus.PENDING.value,  # Current is EVALUATING
            to_status=JobStatus.RUNNING.value,
        )
        assert failed_update is False

        # Add attempt 1
        attempt = JobAttempt(
            job_id=job.id,
            attempt_number=1,
            region_id=region.id,
            status=AttemptStatus.PENDING.value,
        )
        await job_repo.add_attempt(attempt)
        await db_session.commit()

        job_with_attempts = await job_repo.get_with_attempts(job.id)
        assert len(job_with_attempts.attempts) == 1
        assert job_with_attempts.attempts[0].region_id == region.id

    finally:
        # Cleanup (deleting job cascades to attempts)
        await db_session.delete(job)
        await db_session.delete(region)
        await db_session.commit()


@pytest.mark.asyncio
async def test_carbon_observation_zero_fabrication_persistence(db_session: AsyncSession):
    region_code = f"reg-carbon-{uuid.uuid4().hex[:6]}"
    region = Region(
        code=region_code,
        name="Nordic Green",
        provider="AZURE",
        country="Sweden",
        latitude=Decimal("60.128200"),
        longitude=Decimal("18.643500"),
        max_cpu_capacity=Decimal("200.00"),
        max_memory_capacity=Decimal("800.00"),
        idle_power_watts=Decimal("60.00"),
        peak_power_watts=Decimal("250.00"),
    )
    db_session.add(region)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    # 1. Real live observation
    live_obs = CarbonObservation(
        region_id=region.id,
        carbon_intensity=Decimal("45.20"),
        source=CarbonSource.ELECTRICITY_MAPS.value,
        data_quality=CarbonDataQuality.LIVE.value,
        observation_timestamp=now,
        valid_until=now + timedelta(minutes=60),
    )
    db_session.add(live_obs)

    # 2. Unavailable observation (carbon_intensity MUST be NULL)
    unavail_obs = CarbonObservation(
        region_id=region.id,
        carbon_intensity=None,
        source=CarbonSource.REGIONAL_PROFILE.value,
        data_quality=CarbonDataQuality.UNAVAILABLE.value,
        observation_timestamp=now,
        valid_until=now + timedelta(minutes=60),
    )
    db_session.add(unavail_obs)
    await db_session.commit()

    try:
        stmt = (
            select(CarbonObservation)
            .where(CarbonObservation.region_id == region.id)
            .order_by(CarbonObservation.recorded_at.asc())
        )
        res = await db_session.execute(stmt)
        obs_list = list(res.scalars().all())
        assert len(obs_list) == 2
        assert obs_list[0].carbon_intensity == Decimal("45.20")
        assert obs_list[0].data_quality == CarbonDataQuality.LIVE.value
        assert obs_list[1].carbon_intensity is None
        assert obs_list[1].data_quality == CarbonDataQuality.UNAVAILABLE.value

    finally:
        await db_session.execute(delete(CarbonObservation).where(CarbonObservation.region_id == region.id))
        await db_session.delete(region)
        await db_session.commit()


@pytest.mark.asyncio
async def test_scheduling_decision_jsonb_persistence(db_session: AsyncSession):
    deadline = datetime.now(timezone.utc) + timedelta(hours=1)
    job = Job(
        workload_name="model-inference-run",
        workload_type="INFERENCE",
        cpu_demand=Decimal("2.00"),
        memory_demand=Decimal("8.00"),
        base_execution_duration=Decimal("60.00"),
        priority=3,
        deadline=deadline,
    )
    db_session.add(job)
    await db_session.flush()

    decision = SchedulingDecision(
        job_id=job.id,
        decision_action=DecisionAction.EXECUTE.value,
        cost_score_jr=Decimal("0.285400"),
        estimated_energy_kwh=Decimal("0.045000"),
        estimated_co2eq_grams=Decimal("12.4500"),
        carbon_source_used="ELECTRICITY_MAPS",
        carbon_quality_used="LIVE",
        decision_reason="Optimal multi-objective Jr score under grid low-carbon window.",
        score_breakdown={
            "carbon_subscore": 0.08,
            "time_subscore": 0.05,
            "utilization_subscore": 0.10,
            "latency_subscore": 0.0554,
            "total_jr": 0.2854,
        },
        candidate_rankings=[
            {"rank": 1, "region_code": "aws-us-east-1", "score": 0.2854},
            {"rank": 2, "region_code": "gcp-europe-west1", "score": 0.3920},
        ],
        applied_weights={"w_C": 0.4, "w_T": 0.3, "w_U": 0.2, "w_L": 0.1},
        normalization_factors={"E_min": 0.03, "E_max": 0.08},
    )
    db_session.add(decision)
    await db_session.commit()

    try:
        stmt = select(SchedulingDecision).where(SchedulingDecision.job_id == job.id)
        res = await db_session.execute(stmt)
        fetched = res.scalars().first()
        assert fetched is not None
        assert fetched.score_breakdown["total_jr"] == 0.2854
        assert len(fetched.candidate_rankings) == 2
        assert fetched.applied_weights["w_C"] == 0.4
    finally:
        await db_session.delete(decision)
        await db_session.delete(job)
        await db_session.commit()


@pytest.mark.asyncio
async def test_experiment_and_audit_persistence(db_session: AsyncSession):
    exp = Experiment(
        name="Baseline Comparison Benchmark",
        scheduler_variant=SchedulerVariant.ECOROUTE.value,
        random_seed=12345,
        scenario_type="STANDARD_GRID_FLUCTUATION",
        workload_configuration={"job_count": 25},
        region_configuration={"active_regions": 3},
    )
    db_session.add(exp)
    await db_session.flush()

    res = ExperimentResult(
        experiment_id=exp.id,
        scheduler_algorithm="ECOROUTE",
        total_energy_kwh=Decimal("15.500000"),
        total_co2eq_grams=Decimal("3120.0000"),
        avg_execution_time_seconds=Decimal("180.20"),
        avg_latency_ms=Decimal("35.50"),
        deadline_compliance_rate=Decimal("1.0000"),
        failure_rate=Decimal("0.0000"),
        retry_rate=Decimal("0.0400"),
        duplicate_execution_count=0,
        deferral_rate=Decimal("0.0800"),
        avg_region_utilization=Decimal("0.5800"),
        detailed_metrics={"carbon_savings_pct": 28.4},
    )
    db_session.add(res)

    audit = AuditEvent(
        event_type="EXPERIMENT_INITIATED",
        actor="SystemTestRunner",
        event_metadata={"experiment_id": str(exp.id)},
        event_timestamp=datetime.now(timezone.utc),
    )
    db_session.add(audit)
    await db_session.commit()

    try:
        stmt = select(Experiment).where(Experiment.id == exp.id)
        fetched_exp = (await db_session.execute(stmt)).scalars().first()
        assert fetched_exp is not None
        assert fetched_exp.random_seed == 12345

        stmt_audit = select(AuditEvent).where(AuditEvent.id == audit.id)
        fetched_audit = (await db_session.execute(stmt_audit)).scalars().first()
        assert fetched_audit is not None
        assert fetched_audit.event_type == "EXPERIMENT_INITIATED"
    finally:
        await db_session.delete(res)
        await db_session.delete(exp)
        await db_session.delete(audit)
        await db_session.commit()
