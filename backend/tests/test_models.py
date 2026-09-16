import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest

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
    ExperimentStatus,
)


def test_job_model_defaults():
    job_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    deadline = now + timedelta(hours=2)

    job = Job(
        id=job_id,
        workload_name="batch-inference-001",
        workload_type="INFERENCE",
        cpu_demand=Decimal("4.00"),
        memory_demand=Decimal("16.00"),
        base_execution_duration=Decimal("300.00"),
        priority=5,
        deadline=deadline,
    )

    assert job.id == job_id
    assert job.workload_name == "batch-inference-001"
    assert job.status == JobStatus.PENDING.value
    assert job.current_attempt_count == 0
    assert job.max_retries == 3


def test_region_model_defaults():
    region = Region(
        code="aws-us-east-1",
        name="US East (N. Virginia)",
        provider="AWS",
        country="USA",
        latitude=Decimal("38.130000"),
        longitude=Decimal("-78.450000"),
        max_cpu_capacity=Decimal("1000.00"),
        max_memory_capacity=Decimal("4000.00"),
        idle_power_watts=Decimal("100.00"),
        peak_power_watts=Decimal("400.00"),
    )

    assert region.code == "aws-us-east-1"
    assert region.current_utilization == Decimal("0.0")
    assert region.performance_factor == Decimal("1.0")
    assert region.network_latency_ms == Decimal("0.0")
    assert region.is_available is True
    assert region.is_active is True


def test_carbon_observation_zero_fabrication():
    obs_time = datetime.now(timezone.utc)
    valid_until = obs_time + timedelta(minutes=15)

    # Valid LIVE observation with real intensity
    live_obs = CarbonObservation(
        region_id=uuid.uuid4(),
        carbon_intensity=Decimal("245.50"),
        source=CarbonSource.ELECTRICITY_MAPS.value,
        data_quality=CarbonDataQuality.LIVE.value,
        observation_timestamp=obs_time,
        valid_until=valid_until,
    )
    assert live_obs.carbon_intensity == Decimal("245.50")

    # Valid UNAVAILABLE observation with NULL intensity (zero fabrication)
    unavail_obs = CarbonObservation(
        region_id=uuid.uuid4(),
        carbon_intensity=None,
        source=CarbonSource.REGIONAL_PROFILE.value,
        data_quality=CarbonDataQuality.UNAVAILABLE.value,
        observation_timestamp=obs_time,
        valid_until=valid_until,
    )
    assert unavail_obs.carbon_intensity is None
    assert unavail_obs.data_quality == CarbonDataQuality.UNAVAILABLE.value


def test_scheduling_decision_instantiation():
    decision = SchedulingDecision(
        job_id=uuid.uuid4(),
        decision_action=DecisionAction.EXECUTE.value,
        cost_score_jr=Decimal("0.342150"),
        estimated_energy_kwh=Decimal("0.125000"),
        estimated_co2eq_grams=Decimal("30.6875"),
        carbon_source_used="ELECTRICITY_MAPS",
        carbon_quality_used="LIVE",
        decision_reason="Selected aws-us-east-1 based on lowest multi-objective Jr cost.",
        score_breakdown={"carbon": 0.1, "time": 0.1, "util": 0.1, "latency": 0.04},
        candidate_rankings=[{"rank": 1, "region": "aws-us-east-1"}],
        applied_weights={"w_C": 0.4, "w_T": 0.3, "w_U": 0.2, "w_L": 0.1},
        normalization_factors={"min_jr": 0.34, "max_jr": 0.89},
    )
    assert decision.decision_action == DecisionAction.EXECUTE.value
    assert decision.cost_score_jr == Decimal("0.342150")


def test_experiment_and_result_models():
    exp = Experiment(
        name="Grid Volatility Scenario A",
        scheduler_variant=SchedulerVariant.ECOROUTE.value,
        random_seed=42,
        scenario_type="HIGH_RENEWABLE_PENETRATION",
        workload_configuration={"count": 50, "type": "MIXED"},
        region_configuration={"regions": ["aws-us-east-1", "gcp-europe-west1"]},
        status=ExperimentStatus.PENDING.value,
    )
    assert exp.scheduler_variant == "ECOROUTE"
    assert exp.random_seed == 42

    result = ExperimentResult(
        experiment_id=exp.id,
        scheduler_algorithm="ECOROUTE",
        total_energy_kwh=Decimal("12.450000"),
        total_co2eq_grams=Decimal("2340.5000"),
        avg_execution_time_seconds=Decimal("210.50"),
        avg_latency_ms=Decimal("45.20"),
        deadline_compliance_rate=Decimal("0.9800"),
        failure_rate=Decimal("0.0200"),
        retry_rate=Decimal("0.0400"),
        duplicate_execution_count=0,
        deferral_rate=Decimal("0.1200"),
        avg_region_utilization=Decimal("0.6500"),
        detailed_metrics={"savings_percent": 24.5},
    )
    assert result.duplicate_execution_count == 0
    assert result.deadline_compliance_rate == Decimal("0.9800")
