"""Tests for canonical 25-region expansion, Electricity Maps mapping integrity, and zero fabrication."""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.carbon.service import CarbonService, DEFAULT_ZONE_MAPPINGS
from app.db.seed import DEFAULT_REGIONS
from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.job import Job
from app.domain.region import Region
from app.domain.values import JobPriority, SchedulingWeights, WorkloadDemand
from app.persistence.models.enums import DecisionAction, JobStatus, SchedulerVariant, WorkloadType
from app.scheduling.engine import DecisionEngine
from app.scheduling.energy_estimator import EnergyEstimator
from app.scheduling.strategies import get_scheduler_strategy


def make_test_canonical_regions():
    """Generates 25 DomainRegion instances based on canonical seed topology."""
    regions = []
    for r in DEFAULT_REGIONS:
        regions.append(
            Region(
                id=uuid.uuid4(),
                code=r["code"],
                name=r["name"],
                provider=r["provider"],
                max_cpu_capacity=r["max_cpu_capacity"],
                max_memory_capacity=r["max_memory_capacity"],
                electricity_maps_zone=r["electricity_maps_zone"],
                current_utilization=r["current_utilization"],
                performance_factor=r["performance_factor"],
                idle_power_watts=r["idle_power_watts"],
                peak_power_watts=r["peak_power_watts"],
                network_latency_ms=r["network_latency_ms"],
                is_available=r["is_available"],
                is_active=r["is_active"],
            )
        )
    return regions


class TestRegionExpansionArchitecture:
    def test_canonical_region_count_is_at_least_20(self):
        """Phase 2 & Acceptance Criteria: Verify at least 20-25 canonical regions are defined."""
        assert len(DEFAULT_REGIONS) == 25
        assert all(r["is_active"] and r["is_available"] for r in DEFAULT_REGIONS)

    def test_all_canonical_regions_have_explicit_em_zones(self):
        """Phase 3 & 4: Every canonical region has an explicit Electricity Maps zone."""
        for r in DEFAULT_REGIONS:
            assert "electricity_maps_zone" in r
            assert r["electricity_maps_zone"] is not None
            assert len(r["electricity_maps_zone"].strip()) > 0

    def test_no_provider_name_mixing(self):
        """Directive 1: Verify all canonical compute regions are provider-consistent (AWS)."""
        for r in DEFAULT_REGIONS:
            assert r["provider"] == "AWS"
            # Ensure no GCP identifiers like us-central1 are present
            assert "us-central1" != r["code"]
            assert "europe-central2" != r["code"]

    def test_zone_code_resolution_prioritizes_database_record(self):
        """Directive 4: Region.electricity_maps_zone in DB is the authoritative single source of truth."""
        carbon_svc = CarbonService()
        reg = Region(
            code="custom-test-reg",
            name="Custom Target",
            provider="AWS",
            max_cpu_capacity=Decimal("128.0"),
            max_memory_capacity=Decimal("512.0"),
            electricity_maps_zone="SE-SE3",
        )
        resolved_zone = carbon_svc.resolve_zone_code(reg)
        assert resolved_zone == "SE-SE3"

    @pytest.mark.asyncio
    async def test_decision_engine_evaluates_all_25_candidate_regions(self):
        """Phase 7 & 8: Candidate discovery evaluates all 25 active regions without truncation."""
        regions = make_test_canonical_regions()
        assert len(regions) == 25

        mock_carbon_svc = MagicMock(spec=CarbonService)
        # Mock carbon resolution for each region
        async def mock_get_carbon(reg, session=None):
            return CarbonIntensity(
                quality=CarbonQuality.LIVE_TRUSTED,
                source=CarbonSource.LIVE,
                value=Decimal("150.0"),
                zone=reg.electricity_maps_zone,
            )
        mock_carbon_svc.get_carbon_intensity = AsyncMock(side_effect=mock_get_carbon)
        mock_carbon_svc.get_forecast = AsyncMock(return_value=None)

        engine = DecisionEngine(carbon_service=mock_carbon_svc)

        now = datetime.now(timezone.utc)
        job = Job(
            id=uuid.uuid4(),
            workload_name="High-throughput Batch",
            workload_type=WorkloadType.BATCH,
            demand=WorkloadDemand(
                cpu_demand=Decimal("16.0"),
                memory_demand=Decimal("64.0"),
                base_execution_duration=Decimal("1800.0"),
            ),
            priority=JobPriority(8),
            deadline=now + timedelta(hours=12),
        )

        decision = await engine.schedule(
            job=job,
            candidate_regions=regions,
            variant=SchedulerVariant.ECOROUTE,
            current_time=now,
        )

        assert decision.decision_action == DecisionAction.EXECUTE
        assert len(decision.candidate_rankings) == 25
        feasible_count = sum(1 for c in decision.candidate_rankings if c.get("is_feasible", True))
        assert feasible_count == 25

    @pytest.mark.asyncio
    async def test_carbon_source_integrity_when_partial_data_unavailable(self):
        """Directive 9: When carbon data is unavailable for 5 regions:
        - 25 candidates are evaluated
        - unavailable carbon is NEVER defaulted or fabricated to 0
        - evaluation-wide conventional fallback is safely triggered without crashing
        """
        regions = make_test_canonical_regions()
        unavailable_codes = {"us-east-1", "us-east-2", "eu-west-1", "ap-northeast-1", "me-central-1"}

        mock_carbon_svc = MagicMock(spec=CarbonService)
        async def mock_get_carbon(reg, session=None):
            if reg.code in unavailable_codes:
                return CarbonIntensity(
                    quality=CarbonQuality.UNAVAILABLE,
                    source=CarbonSource.UNAVAILABLE,
                    value=None,
                    zone=reg.electricity_maps_zone,
                )
            return CarbonIntensity(
                quality=CarbonQuality.LIVE_TRUSTED,
                source=CarbonSource.LIVE,
                value=Decimal("120.0"),
                zone=reg.electricity_maps_zone,
            )
        mock_carbon_svc.get_carbon_intensity = AsyncMock(side_effect=mock_get_carbon)
        mock_carbon_svc.get_forecast = AsyncMock(return_value=None)

        engine = DecisionEngine(carbon_service=mock_carbon_svc)
        now = datetime.now(timezone.utc)
        job = Job(
            id=uuid.uuid4(),
            workload_name="Robust Batch",
            workload_type=WorkloadType.BATCH,
            demand=WorkloadDemand(
                cpu_demand=Decimal("8.0"),
                memory_demand=Decimal("32.0"),
                base_execution_duration=Decimal("600.0"),
            ),
            priority=JobPriority(5),
            deadline=now + timedelta(hours=6),
        )

        decision = await engine.schedule(
            job=job,
            candidate_regions=regions,
            variant=SchedulerVariant.ECOROUTE,
            current_time=now,
        )

        assert len(decision.candidate_rankings) == 25
        # Verify decision mode is CONVENTIONAL_FALLBACK (Critical Rule #2)
        assert decision.decision_mode == "CONVENTIONAL_FALLBACK"
        assert decision.carbon_optimization_applied is False

        # Verify no unavailable region received 0 carbon value
        for cand in decision.candidate_rankings:
            if cand["region_code"] in unavailable_codes:
                assert cand.get("carbon_intensity") is None
                assert cand.get("raw_carbon_gco2") is None

    @pytest.mark.asyncio
    async def test_stockholm_scoring_mathematical_fairness(self):
        """Phase 10 & 26: Verify Stockholm (eu-north-1) wins when it has lowest carbon & good performance,
        but loses when another region has significantly lower latency or better performance factor.
        """
        regions = make_test_canonical_regions()
        mock_carbon_svc = MagicMock(spec=CarbonService)

        # Scenario A: Stockholm has cleanest grid (18 gCO2/kWh) -> wins under ECOROUTE
        async def mock_carbon_a(reg, session=None):
            ci_val = Decimal("18.0") if reg.code == "eu-north-1" else Decimal("350.0")
            return CarbonIntensity(
                quality=CarbonQuality.LIVE_TRUSTED,
                source=CarbonSource.LIVE,
                value=ci_val,
                zone=reg.electricity_maps_zone,
            )
        mock_carbon_svc.get_carbon_intensity = AsyncMock(side_effect=mock_carbon_a)
        mock_carbon_svc.get_forecast = AsyncMock(return_value=None)

        engine = DecisionEngine(carbon_service=mock_carbon_svc)
        now = datetime.now(timezone.utc)
        job = Job(
            id=uuid.uuid4(),
            workload_name="Carbon Sensitive Workload",
            workload_type=WorkloadType.TRAINING,
            demand=WorkloadDemand(
                cpu_demand=Decimal("32.0"),
                memory_demand=Decimal("128.0"),
                base_execution_duration=Decimal("3600.0"),
            ),
            priority=JobPriority(8),
            deadline=now + timedelta(hours=24),
        )

        dec_a = await engine.schedule(
            job=job,
            candidate_regions=regions,
            variant=SchedulerVariant.ECOROUTE,
            current_time=now,
        )
        assert dec_a.score_breakdown["selected_candidate"]["selected_region_code"] == "eu-north-1"

        # Scenario B: PERFORMANCE_ONLY strategy -> region with best performance factor / latency wins
        # eu-central-1 (Frankfurt) has performance_factor = 1.30, latency = 10.0ms
        job_b = Job(
            id=uuid.uuid4(),
            workload_name="Latency Critical Workload",
            workload_type=WorkloadType.INFERENCE,
            demand=WorkloadDemand(
                cpu_demand=Decimal("8.0"),
                memory_demand=Decimal("16.0"),
                base_execution_duration=Decimal("60.0"),
            ),
            priority=JobPriority(1),
            deadline=now + timedelta(hours=1),
        )
        dec_b = await engine.schedule(
            job=job_b,
            candidate_regions=regions,
            variant=SchedulerVariant.PERFORMANCE_ONLY,
            current_time=now,
        )
        assert dec_b.score_breakdown["selected_candidate"]["selected_region_code"] == "eu-central-1"

    @pytest.mark.asyncio
    async def test_workload_rescheduling_on_retry(self):
        """Phase 14: Failed attempts rescheduled by RetryManager evaluate current candidate conditions."""
        regions = make_test_canonical_regions()
        mock_carbon_svc = MagicMock(spec=CarbonService)

        # First run: Zurich (eu-central-2) is cleanest
        async def mock_carbon_run1(reg, session=None):
            ci_val = Decimal("25.0") if reg.code == "eu-central-2" else Decimal("400.0")
            return CarbonIntensity(
                quality=CarbonQuality.LIVE_TRUSTED,
                source=CarbonSource.LIVE,
                value=ci_val,
                zone=reg.electricity_maps_zone,
            )
        mock_carbon_svc.get_carbon_intensity = AsyncMock(side_effect=mock_carbon_run1)
        mock_carbon_svc.get_forecast = AsyncMock(return_value=None)

        engine = DecisionEngine(carbon_service=mock_carbon_svc)
        now = datetime.now(timezone.utc)
        job = Job(
            id=uuid.uuid4(),
            workload_name="Resilience Job",
            workload_type=WorkloadType.BATCH,
            demand=WorkloadDemand(
                cpu_demand=Decimal("8.0"),
                memory_demand=Decimal("32.0"),
                base_execution_duration=Decimal("600.0"),
            ),
            priority=JobPriority(5),
            deadline=now + timedelta(hours=8),
        )

        dec1 = await engine.schedule(
            job=job,
            candidate_regions=regions,
            variant=SchedulerVariant.CARBON_ONLY,
            current_time=now,
        )
        assert dec1.score_breakdown["selected_candidate"]["selected_region_code"] == "eu-central-2"

        # Simulate execution failure and retry transition: DISPATCHED -> RUNNING -> EVALUATING (reschedulable)
        job.transition_to(JobStatus.RUNNING)
        job.transition_to(JobStatus.EVALUATING)

        # Simulate Retry: Canada (ca-central-1) is now cleanest
        async def mock_carbon_run2(reg, session=None):
            ci_val = Decimal("15.0") if reg.code == "ca-central-1" else Decimal("800.0")
            return CarbonIntensity(
                quality=CarbonQuality.LIVE_TRUSTED,
                source=CarbonSource.LIVE,
                value=ci_val,
                zone=reg.electricity_maps_zone,
            )
        mock_carbon_svc.get_carbon_intensity = AsyncMock(side_effect=mock_carbon_run2)

        dec2 = await engine.schedule(
            job=job,
            candidate_regions=regions,
            variant=SchedulerVariant.CARBON_ONLY,
            current_time=now + timedelta(minutes=10),
        )
        assert dec2.score_breakdown["selected_candidate"]["selected_region_code"] == "ca-central-1"
