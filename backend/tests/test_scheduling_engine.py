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

    @pytest.mark.asyncio
    async def test_score_correctness_and_jr_recalculation(self, sample_job, sample_regions):
        """Item 7: Verify all score components come from the same snapshot and Jr recalculates identically."""
        mock_carbon_service = AsyncMock(spec=CarbonService)
        mock_carbon_service.get_carbon_intensity.side_effect = [
            CarbonIntensity(CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("250.0")),
            CarbonIntensity(CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("100.0")),
        ]

        engine = DecisionEngine(carbon_service=mock_carbon_service)
        decision = await engine.schedule(
            job=sample_job,
            candidate_regions=sample_regions,
            variant=SchedulerVariant.ECOROUTE,
        )

        assert decision.decision_action == DecisionAction.EXECUTE
        rankings = decision.candidate_rankings
        assert len(rankings) == 2
        winner_rank = rankings[0]
        snap = decision.score_breakdown["selected_candidate"]

        # Assert selected candidate snapshot matches rank 1 candidate
        assert snap["selected_region_code"] == winner_rank["region_code"]
        assert snap["composite_score"] == winner_rank["composite_score"]

        # Recalculate Jr independently from weights and normalized components
        weights = decision.applied_weights
        norm_c = Decimal(str(winner_rank["norm_carbon"]))
        norm_d = Decimal(str(winner_rank["norm_duration"]))
        norm_u = Decimal(str(winner_rank["norm_utilization"]))
        norm_l = Decimal(str(winner_rank["norm_latency"]))

        recalculated_jr = (
            weights.carbon * norm_c
            + weights.time * norm_d
            + weights.utilization * norm_u
            + weights.latency * norm_l
        )

        assert Decimal(str(snap["composite_score"])) == recalculated_jr
        assert Decimal(str(winner_rank["cost_score_jr"])) == recalculated_jr

    @pytest.mark.asyncio
    async def test_region_selection_changes_with_weights_and_telemetry(self, sample_job):
        """Item 8: Verify winning region changes deterministically when weights shift."""
        # Region A: High carbon (400), Low latency (5ms), fast execution (perf 2.0)
        reg_a = Region(
            code="reg-fast-dirty",
            name="Fast Dirty Region",
            provider="AWS",
            max_cpu_capacity=Decimal("32.0"),
            max_memory_capacity=Decimal("128.0"),
            performance_factor=Decimal("2.0"),
            current_utilization=Decimal("0.10"),
            network_latency_ms=Decimal("5.0"),
        )
        # Region B: Low carbon (50), High latency (80ms), slower execution (perf 0.8)
        reg_b = Region(
            code="reg-slow-clean",
            name="Slow Clean Region",
            provider="AWS",
            max_cpu_capacity=Decimal("32.0"),
            max_memory_capacity=Decimal("128.0"),
            performance_factor=Decimal("0.8"),
            current_utilization=Decimal("0.10"),
            network_latency_ms=Decimal("80.0"),
        )
        regions = [reg_a, reg_b]

        mock_carbon_service = AsyncMock(spec=CarbonService)
        mock_carbon_service.get_carbon_intensity.side_effect = [
            CarbonIntensity(CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("400.0")),
            CarbonIntensity(CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("50.0")),
            CarbonIntensity(CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("400.0")),
            CarbonIntensity(CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("50.0")),
        ]

        engine = DecisionEngine(carbon_service=mock_carbon_service)

        # 1. Carbon-only variant -> reg-slow-clean must win
        dec_carbon = await engine.schedule(
            job=sample_job,
            candidate_regions=regions,
            variant=SchedulerVariant.CARBON_ONLY,
        )
        assert dec_carbon.selected_region_id == reg_b.id

        # 2. Performance-only variant -> reg-fast-dirty must win
        job_perf = Job(
            workload_name="genomic-batch-102",
            workload_type="BATCH",
            demand=sample_job.demand,
            priority=sample_job.priority,
            deadline=sample_job.deadline,
        )
        dec_perf = await engine.schedule(
            job=job_perf,
            candidate_regions=regions,
            variant=SchedulerVariant.PERFORMANCE_ONLY,
        )
        assert dec_perf.selected_region_id == reg_a.id

    @pytest.mark.asyncio
    async def test_deferral_status_and_priority_policies(self):
        """Item 1, 2, 3: Verify forecast status distinction and priority mapping."""
        now = datetime.now(timezone.utc)
        demand = WorkloadDemand(Decimal("2.0"), Decimal("8.0"), Decimal("100.0"))
        region = Region(
            code="reg-1",
            name="Region 1",
            provider="AWS",
            max_cpu_capacity=Decimal("16.0"),
            max_memory_capacity=Decimal("64.0"),
            network_latency_ms=Decimal("10.0"),
        )

        # High priority job (priority 2) -> no deferral
        high_job = Job(
            workload_name="high-pri-job",
            workload_type="BATCH",
            demand=demand,
            priority=JobPriority(2),
            deadline=now + timedelta(seconds=3600),
        )

        mock_carbon_service = AsyncMock(spec=CarbonService)
        mock_carbon_service.get_carbon_intensity.return_value = CarbonIntensity(
            CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("200.0")
        )

        engine = DecisionEngine(carbon_service=mock_carbon_service)
        dec_high = await engine.schedule(job=high_job, candidate_regions=[region])

        assert dec_high.decision_action == DecisionAction.EXECUTE
        def_info_high = dec_high.score_breakdown["deferral_info"]
        assert def_info_high["priority_class"] == "HIGH"
        assert "Ineligible (HIGH" in def_info_high["deferral_policy"]
        assert def_info_high["deferral_eligible"] is False
