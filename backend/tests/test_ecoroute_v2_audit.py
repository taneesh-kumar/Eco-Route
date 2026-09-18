"""Comprehensive tests for EcoRoute v2.0 audit and critical design invariants."""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.carbon.cache import CarbonCache, CachedCarbonObservation
from app.carbon.client import ElectricityMapsClient
from app.db.seed import DEFAULT_REGIONS
from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.job import Job
from app.domain.region import Region
from app.domain.values import JobPriority, SchedulingWeights, WorkloadDemand
from app.persistence.models.enums import WorkloadType
from app.scheduling.energy_estimator import EnergyEstimator
from app.scheduling.engine import DecisionEngine
from app.scheduling.normalizer import MetricBounds, Normalizer


class TestEcoRouteV2Audit:
    def test_all_configured_regions_have_valid_zone_mappings(self):
        """Rule 1 & Audit: Verify all seed regions have valid, non-empty electricity_maps_zone."""
        region_codes = {r["code"]: r["electricity_maps_zone"] for r in DEFAULT_REGIONS}
        
        # Verify us-east is US-MIDA-PJM (not broken US-MIDW-PJM)
        assert region_codes.get("us-east") == "US-MIDA-PJM"
        assert region_codes.get("se-sto") == "SE-SE3"
        assert region_codes.get("fr-par") == "FR"
        assert region_codes.get("de-fra") == "DE"
        assert region_codes.get("pl-war") == "PL"
        assert region_codes.get("jp-tyo") == "JP-TK"
        assert region_codes.get("uk-lon") == "GB"

        for r in DEFAULT_REGIONS:
            assert r["electricity_maps_zone"] is not None
            assert len(r["electricity_maps_zone"]) > 0

    def test_api_v4_response_parsing_with_provenance(self):
        """Rule 2 & 4: Electricity Maps API v4 response parsing includes full provenance."""
        client = ElectricityMapsClient(api_key="test-key")
        v4_payload = {
            "zone": "SE-SE3",
            "carbonIntensity": 42.5,
            "datetime": "2026-09-18T12:00:00.000Z",
            "updatedAt": "2026-09-18T12:05:00.000Z",
            "isEstimated": False,
            "estimationMethod": "measured",
            "flowTraced": True,
            "emissionFactorType": "lifecycle",
            "temporalGranularity": "hourly",
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = v4_payload

        with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_resp)):
            import asyncio
            result = asyncio.run(client.get_latest_carbon_intensity("SE-SE3"))

        assert result.carbon_intensity == Decimal("42.5")
        assert result.is_estimated is False
        assert result.estimation_method == "measured"
        assert result.flow_traced is True
        assert result.temporal_granularity == "hourly"

    def test_cache_ttl_and_stale_behavior(self):
        """Rule 5 & 10: CachedCarbonObservation accurately tracks freshness and age."""
        now = datetime.now(timezone.utc)
        
        # Valid fresh entry
        cached_valid = CachedCarbonObservation(
            region_id=uuid.uuid4(),
            carbon_intensity=Decimal("50.0"),
            quality=CarbonQuality.LIVE_TRUSTED,
            source=CarbonSource.ELECTRICITY_MAPS,
            observation_timestamp=now,
            valid_until=now + timedelta(seconds=300),
            zone="SE-SE3",
        )
        assert cached_valid.is_fresh is True
        assert cached_valid.cache_age_seconds <= 1

        # Expired entry
        past_time = now - timedelta(seconds=400)
        cached_stale = CachedCarbonObservation(
            region_id=uuid.uuid4(),
            carbon_intensity=Decimal("50.0"),
            quality=CarbonQuality.LIVE_TRUSTED,
            source=CarbonSource.ELECTRICITY_MAPS,
            observation_timestamp=past_time,
            valid_until=now - timedelta(seconds=100),
            zone="SE-SE3",
        )
        assert cached_stale.is_fresh is False
        assert cached_stale.cache_age_seconds >= 400

    def test_u_after_projected_utilization_in_ranking(self):
        """Rule 20 & Audit: Ranker uses projected U_after = U_before + (demand / capacity)."""
        region = Region(
            id=uuid.uuid4(),
            code="test-reg",
            name="Test Region",
            provider="AWS",
            max_cpu_capacity=Decimal("100.0"),
            max_memory_capacity=Decimal("400.0"),
            current_utilization=Decimal("0.40"),
            performance_factor=Decimal("1.0"),
            idle_power_watts=Decimal("100.0"),
            peak_power_watts=Decimal("400.0"),
            network_latency_ms=Decimal("20.0"),
            electricity_maps_zone="SE-SE3",
        )

        cpu_demand = Decimal("20.0")
        u_proj = region.projected_utilization(cpu_demand)
        # 0.40 + (20 / 100) = 0.60
        assert u_proj == Decimal("0.60")

        # Verify MetricBounds normalizes projected utilization
        bounds = MetricBounds(min_val=Decimal("0.60"), max_val=Decimal("0.80"))
        assert bounds.normalize(u_proj) == Decimal("0.0")  # u_proj is 0.60 (min bound)
        assert bounds.normalize(Decimal("0.80")) == Decimal("1.0")  # max bound

    def test_priority_class_and_carbon_deferral_rules(self):
        """Rule 15: Priority class controls whether carbon deferral is permitted."""
        p_high = JobPriority(value=2)
        assert p_high.priority_class == "HIGH"
        assert p_high.allows_carbon_deferral is False

        p_med = JobPriority(value=5)
        assert p_med.priority_class == "MEDIUM"
        assert p_med.allows_carbon_deferral is True

        p_low = JobPriority(value=9)
        assert p_low.priority_class == "LOW"
        assert p_low.allows_carbon_deferral is True

    @pytest.mark.asyncio
    async def test_conventional_fallback_mode_when_carbon_unavailable(self):
        """Rule 30: When live carbon and cache are unavailable, engine transitions to CONVENTIONAL_FALLBACK."""
        region = Region(
            id=uuid.uuid4(),
            code="se-sto",
            name="Sweden Central",
            provider="AWS",
            max_cpu_capacity=Decimal("100.0"),
            max_memory_capacity=Decimal("400.0"),
            current_utilization=Decimal("0.20"),
            performance_factor=Decimal("1.0"),
            idle_power_watts=Decimal("100.0"),
            peak_power_watts=Decimal("400.0"),
            network_latency_ms=Decimal("20.0"),
            electricity_maps_zone="SE-SE3",
        )

        job = Job(
            id=uuid.uuid4(),
            workload_name="fallback-test-job",
            workload_type=WorkloadType.BATCH,
            demand=WorkloadDemand(Decimal("4.0"), Decimal("16.0"), Decimal("60.0")),
            priority=JobPriority(5),
            deadline=datetime.now(timezone.utc) + timedelta(hours=1),
        )

        # Unavailable carbon observation
        mock_carbon_svc = AsyncMock()
        mock_carbon_svc.get_carbon_intensity.return_value = CarbonIntensity(
            quality=CarbonQuality.UNAVAILABLE,
            source=CarbonSource.ELECTRICITY_MAPS,
            value=None,
        )

        engine = DecisionEngine(carbon_service=mock_carbon_svc)
        decision = await engine.schedule(
            job=job,
            candidate_regions=[region],
        )

        assert decision.decision_mode == "CONVENTIONAL_FALLBACK"
        assert decision.carbon_optimization_applied is False
        assert decision.fallback_reason is not None
        assert "conventional" in decision.fallback_reason.lower() or "unavailable" in decision.fallback_reason.lower()
        # Selected region is feasible
        assert decision.selected_region_id == region.id

    @pytest.mark.asyncio
    async def test_baseline_counterfactual_savings_calculation(self):
        """Rule 35: Engine computes counterfactual conventional baseline and actual CO2 savings."""
        r_clean = Region(
            id=uuid.uuid4(),
            code="se-sto",
            name="Sweden Central",
            provider="AWS",
            max_cpu_capacity=Decimal("100.0"),
            max_memory_capacity=Decimal("400.0"),
            current_utilization=Decimal("0.20"),
            performance_factor=Decimal("1.0"),
            idle_power_watts=Decimal("100.0"),
            peak_power_watts=Decimal("400.0"),
            network_latency_ms=Decimal("40.0"),
            electricity_maps_zone="SE-SE3",
        )

        r_dirty_low_latency = Region(
            id=uuid.uuid4(),
            code="pl-war",
            name="Poland Central",
            provider="GCP",
            max_cpu_capacity=Decimal("100.0"),
            max_memory_capacity=Decimal("400.0"),
            current_utilization=Decimal("0.20"),
            performance_factor=Decimal("1.0"),
            idle_power_watts=Decimal("100.0"),
            peak_power_watts=Decimal("400.0"),
            network_latency_ms=Decimal("10.0"),  # Lower latency -> would be chosen by conventional baseline
            electricity_maps_zone="PL",
        )

        job = Job(
            id=uuid.uuid4(),
            workload_name="carbon-savings-job",
            workload_type=WorkloadType.BATCH,
            demand=WorkloadDemand(Decimal("4.0"), Decimal("16.0"), Decimal("60.0")),
            priority=JobPriority(5),
            deadline=datetime.now(timezone.utc) + timedelta(hours=1),
        )

        obs_clean = CarbonIntensity(
            quality=CarbonQuality.LIVE_TRUSTED,
            source=CarbonSource.ELECTRICITY_MAPS,
            value=Decimal("30.0"),
        )
        obs_dirty = CarbonIntensity(
            quality=CarbonQuality.LIVE_TRUSTED,
            source=CarbonSource.ELECTRICITY_MAPS,
            value=Decimal("750.0"),
        )

        mock_carbon_svc = AsyncMock()
        mock_carbon_svc.get_carbon_intensity.side_effect = lambda r, *args: obs_clean if r.id == r_clean.id else obs_dirty

        engine = DecisionEngine(carbon_service=mock_carbon_svc)
        decision = await engine.schedule(
            job=job,
            candidate_regions=[r_clean, r_dirty_low_latency],
        )

        assert decision.decision_mode == "CARBON_AWARE"
        assert decision.carbon_optimization_applied is True
        assert decision.selected_region_id == r_clean.id
        assert decision.baseline_region_id == r_dirty_low_latency.id
        assert decision.estimated_savings_co2eq_grams is not None
        assert decision.estimated_savings_co2eq_grams > Decimal("0.0")
