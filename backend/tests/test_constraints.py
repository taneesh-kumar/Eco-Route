import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.persistence.models import (
    Job,
    JobAttempt,
    Region,
    CarbonObservation,
    Experiment,
    CarbonDataQuality,
    CarbonSource,
)


@pytest.mark.asyncio
async def test_attempt_foreign_key_constraint(db_session: AsyncSession):
    non_existent_job_id = uuid.uuid4()
    non_existent_region_id = uuid.uuid4()

    attempt = JobAttempt(
        job_id=non_existent_job_id,
        attempt_number=1,
        region_id=non_existent_region_id,
    )
    db_session.add(attempt)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_unique_attempt_number_per_job(db_session: AsyncSession):
    region = Region(
        code=f"reg-uq-{uuid.uuid4().hex[:6]}",
        name="Region Unique",
        provider="AWS",
        country="Ireland",
        latitude=Decimal("53.349800"),
        longitude=Decimal("-6.260300"),
        max_cpu_capacity=Decimal("100.00"),
        max_memory_capacity=Decimal("400.00"),
        idle_power_watts=Decimal("50.00"),
        peak_power_watts=Decimal("200.00"),
    )
    job = Job(
        workload_name="job-uq-test",
        workload_type="BATCH",
        cpu_demand=Decimal("1.00"),
        memory_demand=Decimal("2.00"),
        base_execution_duration=Decimal("10.00"),
        priority=1,
        deadline=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db_session.add_all([region, job])
    await db_session.flush()

    try:
        attempt1 = JobAttempt(job_id=job.id, attempt_number=1, region_id=region.id)
        attempt2 = JobAttempt(job_id=job.id, attempt_number=1, region_id=region.id)

        db_session.add(attempt1)
        await db_session.flush()

        db_session.add(attempt2)
        with pytest.raises(IntegrityError):
            await db_session.flush()
    finally:
        await db_session.rollback()


@pytest.mark.asyncio
async def test_zero_fabrication_constraint_rejection(db_session: AsyncSession):
    region = Region(
        code=f"reg-zero-fab-{uuid.uuid4().hex[:6]}",
        name="Region ZF",
        provider="AWS",
        country="France",
        latitude=Decimal("48.856600"),
        longitude=Decimal("2.352200"),
        max_cpu_capacity=Decimal("100.00"),
        max_memory_capacity=Decimal("400.00"),
        idle_power_watts=Decimal("50.00"),
        peak_power_watts=Decimal("200.00"),
    )
    db_session.add(region)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    valid_until = now + timedelta(minutes=15)

    try:
        # 1. Violation: UNAVAILABLE quality must NOT have carbon_intensity
        invalid_unavail = CarbonObservation(
            region_id=region.id,
            carbon_intensity=Decimal("120.00"),  # Fabricated! Should be NULL
            source=CarbonSource.ELECTRICITY_MAPS.value,
            data_quality=CarbonDataQuality.UNAVAILABLE.value,
            observation_timestamp=now,
            valid_until=valid_until,
        )
        db_session.add(invalid_unavail)
        with pytest.raises(IntegrityError):
            await db_session.flush()
        await db_session.rollback()

        # Re-add region in clean transaction
        db_session.add(region)
        await db_session.flush()

        # 2. Violation: LIVE quality must NOT have NULL carbon_intensity
        invalid_live = CarbonObservation(
            region_id=region.id,
            carbon_intensity=None,  # Missing intensity for LIVE
            source=CarbonSource.ELECTRICITY_MAPS.value,
            data_quality=CarbonDataQuality.LIVE.value,
            observation_timestamp=now,
            valid_until=valid_until,
        )
        db_session.add(invalid_live)
        with pytest.raises(IntegrityError):
            await db_session.flush()

    finally:
        await db_session.rollback()


@pytest.mark.asyncio
async def test_job_priority_check_constraint(db_session: AsyncSession):
    # Priority must be between 1 and 10
    invalid_job = Job(
        workload_name="invalid-priority-job",
        workload_type="BATCH",
        cpu_demand=Decimal("1.00"),
        memory_demand=Decimal("2.00"),
        base_execution_duration=Decimal("10.00"),
        priority=15,  # Exceeds max 10
        deadline=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db_session.add(invalid_job)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_experiment_variant_check_constraint(db_session: AsyncSession):
    # scheduler_variant must be one of the 5 allowed variants
    invalid_exp = Experiment(
        name="Invalid Variant Experiment",
        scheduler_variant="UNAUTHORIZED_SCHEDULER",
        random_seed=999,
        scenario_type="TEST",
        workload_configuration={},
        region_configuration={},
    )
    db_session.add(invalid_exp)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()
