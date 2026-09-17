"""Pure unit tests for domain entities: Job, JobAttempt, Region, SchedulingDecision."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest

from app.domain.attempt import JobAttempt
from app.domain.carbon import CarbonQuality, CarbonSource
from app.domain.decision import SchedulingDecision
from app.domain.exceptions import (
    InvalidJobConfigurationError,
    InvalidSchedulingDecisionError,
    InvalidStateTransitionError,
    RegionLockViolationError,
    RetryBudgetExhaustedError,
    ZeroCarbonFabricationError,
)
from app.domain.job import Job
from app.domain.region import Region
from app.domain.values import (
    JobPriority,
    SchedulingWeights,
    WorkloadDemand,
)
from app.persistence.models.enums import AttemptStatus, DecisionAction, JobStatus, WorkloadType


class TestJobEntity:
    """Test suite for Job aggregate root."""

    @pytest.fixture
    def default_demand(self):
        return WorkloadDemand(
            cpu_demand=Decimal("4.0"),
            memory_demand=Decimal("8.0"),
            base_execution_duration=Decimal("120.0"),
        )

    def test_job_initialization(self, default_demand):
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(seconds=3600)
        job = Job(
            workload_name="genomic-batch-01",
            workload_type=WorkloadType.BATCH,
            demand=default_demand,
            priority=JobPriority(5),
            deadline=deadline,
            max_retries=3,
        )
        assert job.status == JobStatus.PENDING
        assert job.current_attempt_count == 0
        assert job.max_retries == 3
        assert job.workload_name == "genomic-batch-01"

    def test_job_transitions(self, default_demand):
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(seconds=3600)
        job = Job(
            workload_name="inference-01",
            workload_type=WorkloadType.INFERENCE,
            demand=default_demand,
            priority=JobPriority(8),
            deadline=deadline,
        )

        job.transition_to(JobStatus.EVALUATING)
        assert job.status == JobStatus.EVALUATING

        job.transition_to(JobStatus.WAITING)
        assert job.status == JobStatus.WAITING

        job.transition_to(JobStatus.EVALUATING)
        assert job.status == JobStatus.EVALUATING

        job.transition_to(JobStatus.DISPATCHED)
        assert job.status == JobStatus.DISPATCHED

        job.transition_to(JobStatus.RUNNING)
        assert job.status == JobStatus.RUNNING

        job.transition_to(JobStatus.COMPLETED)
        assert job.status == JobStatus.COMPLETED

        # Terminal state: cannot transition out
        with pytest.raises(InvalidStateTransitionError):
            job.transition_to(JobStatus.EVALUATING)

    def test_job_can_retry(self, default_demand):
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(seconds=600)  # 600s in future, duration = 120s
        job = Job(
            workload_name="training-01",
            workload_type=WorkloadType.TRAINING,
            demand=default_demand,
            priority=JobPriority(5),
            deadline=deadline,
            max_retries=2,
            current_attempt_count=0,
        )
        # Attempt 0: can retry
        assert job.can_retry(current_time=now) is True

        job.record_attempt_dispatched()
        assert job.current_attempt_count == 1
        assert job.can_retry(current_time=now) is True

        job.record_attempt_dispatched()
        assert job.current_attempt_count == 2
        # Max retries exhausted
        assert job.can_retry(current_time=now) is False

        # Attempting to dispatch beyond max_retries raises
        with pytest.raises(RetryBudgetExhaustedError):
            job.record_attempt_dispatched()

    def test_job_cannot_retry_if_deadline_breached(self, default_demand):
        now = datetime.now(timezone.utc)
        # Deadline too tight for duration 120s
        tight_deadline = now + timedelta(seconds=60)
        job = Job(
            workload_name="training-02",
            workload_type=WorkloadType.TRAINING,
            demand=default_demand,
            priority=JobPriority(5),
            deadline=tight_deadline,
            max_retries=3,
            current_attempt_count=0,
        )
        assert job.can_retry(current_time=now) is False


class TestJobAttemptEntity:
    """Test suite for JobAttempt entity and Region Locking."""

    def test_attempt_initialization(self):
        job_id = uuid.uuid4()
        region_id = uuid.uuid4()
        attempt = JobAttempt(
            job_id=job_id,
            attempt_number=1,
            region_id=region_id,
        )
        assert attempt.status == AttemptStatus.PENDING
        assert attempt.attempt_number == 1
        assert attempt.region_id == region_id

    def test_invalid_attempt_number_raises(self):
        with pytest.raises(InvalidJobConfigurationError):
            JobAttempt(
                job_id=uuid.uuid4(),
                attempt_number=0,
                region_id=uuid.uuid4(),
            )

    def test_region_locking_enforcement(self):
        job_id = uuid.uuid4()
        region_1 = uuid.uuid4()
        region_2 = uuid.uuid4()

        attempt = JobAttempt(
            job_id=job_id,
            attempt_number=1,
            region_id=region_1,
        )
        # While PENDING, reassignment is allowed
        attempt.set_region(region_2)
        assert attempt.region_id == region_2

        # Claim the attempt
        attempt.claim(worker_id="worker-node-42")
        assert attempt.status == AttemptStatus.CLAIMED
        assert attempt.claimed_by_worker == "worker-node-42"

        # Region reassignment must be locked and raise RegionLockViolationError
        with pytest.raises(RegionLockViolationError):
            attempt.set_region(region_1)

        # Start execution
        attempt.start()
        assert attempt.status == AttemptStatus.RUNNING

        # Still locked in RUNNING
        with pytest.raises(RegionLockViolationError):
            attempt.set_region(region_1)

        # Complete attempt
        attempt.complete(
            actual_duration=Decimal("115.5"),
            actual_energy_kwh=Decimal("0.450"),
            actual_co2eq_grams=Decimal("32.5"),
        )
        assert attempt.status == AttemptStatus.COMPLETED

        # Still locked in terminal state
        with pytest.raises(RegionLockViolationError):
            attempt.set_region(region_1)


class TestRegionEntity:
    """Test suite for Region entity and hard feasibility constraints."""

    @pytest.fixture
    def sample_region(self):
        return Region(
            code="us-east-1",
            name="US East (N. Virginia)",
            provider="AWS",
            max_cpu_capacity=Decimal("64.0"),
            max_memory_capacity=Decimal("256.0"),
            current_utilization=Decimal("0.50"),  # 32 CPU available, 128 RAM available
            performance_factor=Decimal("1.25"),  # 25% faster
            idle_power_watts=Decimal("60.0"),
            peak_power_watts=Decimal("250.0"),
            network_latency_ms=Decimal("25.0"),
            is_available=True,
            is_active=True,
        )

    def test_region_capacities(self, sample_region):
        assert sample_region.available_cpu == Decimal("32.00")
        assert sample_region.available_memory == Decimal("128.00")

    def test_region_peak_less_than_idle_raises(self):
        with pytest.raises(InvalidJobConfigurationError):
            Region(
                code="invalid-region",
                name="Bad Power Region",
                provider="AWS",
                max_cpu_capacity=Decimal("32.0"),
                max_memory_capacity=Decimal("128.0"),
                idle_power_watts=Decimal("200.0"),
                peak_power_watts=Decimal("100.0"),  # peak < idle
            )

    def test_is_feasible_for_hard_constraints_success(self, sample_region):
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(seconds=3600)
        demand = WorkloadDemand(
            cpu_demand=Decimal("16.0"),
            memory_demand=Decimal("64.0"),
            base_execution_duration=Decimal("600.0"),
        )
        assert sample_region.is_feasible_for(demand, current_time=now, deadline=deadline) is True

    def test_is_feasible_for_cpu_rejection(self, sample_region):
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(seconds=3600)
        # Demand 40 CPU when only 32 is available
        demand = WorkloadDemand(
            cpu_demand=Decimal("40.0"),
            memory_demand=Decimal("64.0"),
            base_execution_duration=Decimal("600.0"),
        )
        assert sample_region.is_feasible_for(demand, current_time=now, deadline=deadline) is False
        reason = sample_region.get_infeasibility_reason(demand, current_time=now, deadline=deadline)
        assert "Insufficient CPU" in reason

    def test_is_feasible_for_memory_rejection(self, sample_region):
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(seconds=3600)
        # Demand 200 RAM when only 128 is available
        demand = WorkloadDemand(
            cpu_demand=Decimal("16.0"),
            memory_demand=Decimal("200.0"),
            base_execution_duration=Decimal("600.0"),
        )
        assert sample_region.is_feasible_for(demand, current_time=now, deadline=deadline) is False
        reason = sample_region.get_infeasibility_reason(demand, current_time=now, deadline=deadline)
        assert "Insufficient RAM" in reason

    def test_is_feasible_for_deadline_rejection(self, sample_region):
        now = datetime.now(timezone.utc)
        # 100s deadline, base duration 150s with perf 1.25 -> 120s required
        tight_deadline = now + timedelta(seconds=100)
        demand = WorkloadDemand(
            cpu_demand=Decimal("8.0"),
            memory_demand=Decimal("16.0"),
            base_execution_duration=Decimal("150.0"),
        )
        assert sample_region.is_feasible_for(demand, current_time=now, deadline=tight_deadline) is False
        reason = sample_region.get_infeasibility_reason(demand, current_time=now, deadline=tight_deadline)
        assert "Deadline violation" in reason

    def test_is_feasible_for_unavailable_region(self, sample_region):
        sample_region.is_available = False
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(seconds=3600)
        demand = WorkloadDemand(
            cpu_demand=Decimal("8.0"),
            memory_demand=Decimal("16.0"),
            base_execution_duration=Decimal("100.0"),
        )
        assert sample_region.is_feasible_for(demand, current_time=now, deadline=deadline) is False
        reason = sample_region.get_infeasibility_reason(demand, current_time=now, deadline=deadline)
        assert "unavailable or inactive" in reason


class TestSchedulingDecisionEntity:
    """Test suite for SchedulingDecision entity."""

    @pytest.fixture
    def default_weights(self):
        return SchedulingWeights(
            carbon=Decimal("0.40"),
            time=Decimal("0.30"),
            utilization=Decimal("0.20"),
            latency=Decimal("0.10"),
        )

    def test_execute_decision_requires_selected_region(self, default_weights):
        job_id = uuid.uuid4()
        # EXECUTE with selected_region_id=None must raise
        with pytest.raises(InvalidSchedulingDecisionError):
            SchedulingDecision(
                job_id=job_id,
                decision_action=DecisionAction.EXECUTE,
                selected_region_id=None,
                carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
                carbon_quality_used=CarbonQuality.LIVE,
                decision_reason="Selected lowest carbon region",
                score_breakdown={"jr": 0.25},
                candidate_rankings=[{"region_id": str(uuid.uuid4()), "score": 0.25}],
                applied_weights=default_weights,
            )

    def test_defer_decision_allows_none_region(self, default_weights):
        job_id = uuid.uuid4()
        decision = SchedulingDecision(
            job_id=job_id,
            decision_action=DecisionAction.DEFER,
            selected_region_id=None,
            carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
            carbon_quality_used=CarbonQuality.LIVE,
            decision_reason="Deferred for green window",
            score_breakdown={},
            candidate_rankings=[],
            applied_weights=default_weights,
        )
        assert decision.decision_action == DecisionAction.DEFER
        assert decision.selected_region_id is None

    def test_zero_carbon_fabrication_on_decision(self, default_weights):
        """If carbon is UNAVAILABLE, estimated_co2eq_grams must not be fabricated."""
        job_id = uuid.uuid4()
        region_id = uuid.uuid4()

        with pytest.raises(ZeroCarbonFabricationError):
            SchedulingDecision(
                job_id=job_id,
                selected_region_id=region_id,
                decision_action=DecisionAction.EXECUTE,
                carbon_source_used=CarbonSource.REGIONAL_PROFILE,
                carbon_quality_used=CarbonQuality.UNAVAILABLE,
                decision_reason="Fallback executed",
                score_breakdown={},
                candidate_rankings=[],
                applied_weights=default_weights,
                estimated_co2eq_grams=Decimal("45.0"),  # Fabricated emission!
            )
