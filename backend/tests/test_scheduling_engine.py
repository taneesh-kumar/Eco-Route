"""Comprehensive tests for DecisionEngine 12-stage pipeline and deferral gating."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock
import uuid
import pytest

from app.carbon.service import CarbonService
from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.job import Job
from app.domain.region import Region
from app.domain.values import JobPriority, WorkloadDemand
from app.persistence.models.enums import DecisionAction, JobStatus, SchedulerVariant
from app.scheduling.engine import DecisionEngine, UnschedulableWorkloadError


class TestSchedulingEngine:
    """Test suite covering the 12-stage scheduling pipeline and edge cases."""

    @pytest.fixture
    def sample_job(self):
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(seconds=3600)
        return Job(
            workload_name="genomic-batch-101",
            workload_type="BATCH",
            demand=WorkloadDemand(
                cpu_demand=Decimal("4.0"),
                memory_demand=Decimal("16.0"),
                base_execution_duration=Decimal("300.0"),
            ),
            priority=JobPriority(5),
            deadline=deadline,
        )

    @pytest.fixture
    def sample_regions(self):
        r1 = Region(
            code="us-east-1",
            name="US East",
            provider="AWS",
            max_cpu_capacity=Decimal("32.0"),
            max_memory_capacity=Decimal("128.0"),
            performance_factor=Decimal("1.0"),
            current_utilization=Decimal("0.20"),
            network_latency_ms=Decimal("15.0"),
        )
        r2 = Region(
            code="eu-west-1",
            name="EU West",
            provider="AWS",
            max_cpu_capacity=Decimal("32.0"),
            max_memory_capacity=Decimal("128.0"),
            performance_factor=Decimal("1.5"),
            current_utilization=Decimal("0.40"),
            network_latency_ms=Decimal("45.0"),
        )
        return [r1, r2]

    @pytest.mark.asyncio
    async def test_normal_ecoroute_execution(self, sample_job, sample_regions):
        mock_carbon_service = AsyncMock(spec=CarbonService)
        # Mock trustworthy live carbon for both regions
        mock_carbon_service.get_carbon_intensity.side_effect = [
            CarbonIntensity(CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("350.0")),
            CarbonIntensity(CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("150.0")),
        ]

        engine = DecisionEngine(carbon_service=mock_carbon_service)
        decision = await engine.schedule(
            job=sample_job,
            candidate_regions=sample_regions,
            variant=SchedulerVariant.ECOROUTE,
        )

        assert decision.decision_action == DecisionAction.EXECUTE
        assert decision.selected_region_id is not None
        assert sample_job.status == JobStatus.DISPATCHED
        assert len(decision.candidate_rankings) == 2
        assert "norm_carbon" in decision.score_breakdown

    @pytest.mark.asyncio
    async def test_partial_carbon_availability_triggers_fallback(self, sample_job, sample_regions):
        """Blocker #2: If ANY feasible candidate has unavailable carbon, evaluation-wide fallback triggers."""
        mock_carbon_service = AsyncMock(spec=CarbonService)
        # r1 has LIVE, r2 has UNAVAILABLE
        mock_carbon_service.get_carbon_intensity.side_effect = [
            CarbonIntensity(CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("200.0")),
            CarbonIntensity(CarbonQuality.UNAVAILABLE, CarbonSource.ELECTRICITY_MAPS, None),
        ]

        engine = DecisionEngine(carbon_service=mock_carbon_service)
        decision = await engine.schedule(
            job=sample_job,
            candidate_regions=sample_regions,
            variant=SchedulerVariant.ECOROUTE,
        )

        assert decision.decision_action == DecisionAction.EXECUTE
        # Applied weights must have carbon weight = 0.0
        assert decision.applied_weights.carbon == Decimal("0.0")
        assert decision.score_breakdown["fallback_mode"] is True

    @pytest.mark.asyncio
    async def test_deferral_with_verified_forecast(self, sample_job, sample_regions):
        """Blocker #1: Deferral permitted if Slack > 0 and verified J_future < J_current - epsilon."""
        mock_carbon_service = AsyncMock(spec=CarbonService)
        mock_carbon_service.get_carbon_intensity.return_value = CarbonIntensity(
            CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("200.0")
        )

        engine = DecisionEngine(carbon_service=mock_carbon_service)
        # Supply verified forecast indicating much lower score (e.g. 0.05 vs current ~0.20+)
        decision = await engine.schedule(
            job=sample_job,
            candidate_regions=sample_regions,
            variant=SchedulerVariant.ECOROUTE,
            verified_forecast_jr=Decimal("0.01"),
            epsilon=Decimal("0.05"),
        )

        assert decision.decision_action == DecisionAction.DEFER
        assert sample_job.status == JobStatus.WAITING
        assert "Deferral approved" in decision.decision_reason

    @pytest.mark.asyncio
    async def test_no_verified_forecast_executes_immediately(self, sample_job, sample_regions):
        """Blocker #1: If no verified forecast is supplied, action is EXECUTE immediately."""
        mock_carbon_service = AsyncMock(spec=CarbonService)
        mock_carbon_service.get_carbon_intensity.return_value = CarbonIntensity(
            CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("200.0")
        )

        engine = DecisionEngine(carbon_service=mock_carbon_service)
        decision = await engine.schedule(
            job=sample_job,
            candidate_regions=sample_regions,
            variant=SchedulerVariant.ECOROUTE,
            verified_forecast_jr=None,  # No forecast
        )

        assert decision.decision_action == DecisionAction.EXECUTE
        assert sample_job.status == JobStatus.DISPATCHED

    @pytest.mark.asyncio
    async def test_zero_feasible_candidates_with_slack_defers(self, sample_job):
        """If zero candidates are feasible but slack remains, action is DEFER to await capacity."""
        # Unfeasible region (insufficient CPU)
        tiny_region = Region(
            code="tiny-1",
            name="Tiny Region",
            provider="AWS",
            max_cpu_capacity=Decimal("2.0"),  # Demand is 4.0 -> Infeasible
            max_memory_capacity=Decimal("8.0"),
        )

        engine = DecisionEngine()
        decision = await engine.schedule(
            job=sample_job,
            candidate_regions=[tiny_region],
        )

        assert decision.decision_action == DecisionAction.DEFER
        assert sample_job.status == JobStatus.WAITING
        assert decision.selected_region_id is None

    @pytest.mark.asyncio
    async def test_zero_feasible_candidates_without_slack_fails(self):
        """If zero candidates are feasible and slack is exhausted, job transitions to FAILED."""
        now = datetime.now(timezone.utc)
        tight_job = Job(
            workload_name="tight-job",
            workload_type="BATCH",
            demand=WorkloadDemand(Decimal("4.0"), Decimal("16.0"), Decimal("300.0")),
            priority=JobPriority(5),
            deadline=now + timedelta(seconds=100),  # Less than 300s duration -> slack exhausted
        )
        tiny_region = Region(
            code="tiny-1",
            name="Tiny Region",
            provider="AWS",
            max_cpu_capacity=Decimal("2.0"),
            max_memory_capacity=Decimal("8.0"),
        )

        engine = DecisionEngine()
        with pytest.raises(UnschedulableWorkloadError):
            await engine.schedule(job=tight_job, candidate_regions=[tiny_region])

        assert tight_job.status == JobStatus.FAILED
