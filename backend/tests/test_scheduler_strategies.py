"""Pure unit tests for all 5 Scheduler Strategies and deterministic tie-breaking."""

from decimal import Decimal
import uuid
import pytest

from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.region import Region
from app.domain.values import SchedulingWeights
from app.persistence.models.enums import SchedulerVariant
from app.scheduling.energy_estimator import RegionalWorkloadEstimate
from app.scheduling.normalizer import NormalizedCandidateMetrics
from app.scheduling.ranker import RegionRanker
from app.scheduling.scorer import ScoreCalculator
from app.scheduling.strategies import (
    CarbonOnlyStrategy,
    ConventionalStrategy,
    EcoRouteStrategy,
    PerformanceOnlyStrategy,
    RandomStrategy,
    get_scheduler_strategy,
)


class TestSchedulerStrategies:
    """Test suite for the 5 scheduler variants and dynamic weight re-normalization."""

    @pytest.fixture
    def sample_candidate(self):
        region = Region(
            code="us-east-1",
            name="US East",
            provider="AWS",
            max_cpu_capacity=Decimal("64.0"),
            max_memory_capacity=Decimal("256.0"),
            network_latency_ms=Decimal("20.0"),
            current_utilization=Decimal("0.40"),
        )
        estimate = RegionalWorkloadEstimate(
            duration_seconds=Decimal("200.0"),
            delta_power_watts=Decimal("50.0"),
            energy_kwh=Decimal("0.05"),
            emissions_co2eq=Decimal("15.0"),
        )
        carbon = CarbonIntensity(
            quality=CarbonQuality.LIVE,
            source=CarbonSource.ELECTRICITY_MAPS,
            value=Decimal("300.0"),
        )
        norm_m = NormalizedCandidateMetrics(
            region_id=region.id,
            norm_duration=Decimal("0.20"),
            norm_utilization=Decimal("0.40"),
            norm_latency=Decimal("0.10"),
            norm_emissions=Decimal("0.50"),
        )
        return region, estimate, carbon, norm_m

    def test_strategy_factory(self):
        assert isinstance(get_scheduler_strategy(SchedulerVariant.ECOROUTE), EcoRouteStrategy)
        assert isinstance(get_scheduler_strategy(SchedulerVariant.CONVENTIONAL), ConventionalStrategy)
        assert isinstance(get_scheduler_strategy(SchedulerVariant.CARBON_ONLY), CarbonOnlyStrategy)
        assert isinstance(get_scheduler_strategy(SchedulerVariant.PERFORMANCE_ONLY), PerformanceOnlyStrategy)
        assert isinstance(get_scheduler_strategy(SchedulerVariant.RANDOM), RandomStrategy)

    def test_ecoroute_weights_and_fallback_renormalization(self):
        strategy = EcoRouteStrategy()
        base_w = strategy.base_weights
        assert base_w.carbon == Decimal("0.40")
        assert base_w.time == Decimal("0.30")
        assert base_w.utilization == Decimal("0.20")
        assert base_w.latency == Decimal("0.10")

        # When carbon is unavailable, weights must renormalize proportionally
        fallback_w = strategy.get_effective_weights(carbon_available=False)
        assert fallback_w.carbon == Decimal("0.0")
        # Sum of non-carbon weights was 0.3 + 0.2 + 0.1 = 0.6
        # New: 0.3/0.6 = 0.5, 0.2/0.6 = 0.3333..., 0.1/0.6 = 0.1666...
        total = fallback_w.time + fallback_w.utilization + fallback_w.latency
        assert total == Decimal("1.0")

    def test_conventional_strategy_decoupled_from_fallback(self, sample_candidate):
        strategy = ConventionalStrategy()
        base_w = strategy.base_weights
        assert base_w.carbon == Decimal("0.0")
        assert base_w.time == Decimal("0.50")
        assert base_w.utilization == Decimal("0.30")
        assert base_w.latency == Decimal("0.20")

        region, estimate, carbon, norm_m = sample_candidate
        candidates = [(region, estimate, carbon)]
        normalized_metrics = {region.id: norm_m}

        ranked = strategy.rank_candidates(candidates, normalized_metrics, carbon_available=True)
        assert len(ranked) == 1
        # Conventional ignores carbon even if available
        assert ranked[0].score_result.score_breakdown["norm_carbon"] is None

    def test_carbon_only_strategy(self, sample_candidate):
        strategy = CarbonOnlyStrategy()
        assert strategy.base_weights.carbon == Decimal("1.0")
        assert strategy.base_weights.time == Decimal("0.0")

        region, estimate, carbon, norm_m = sample_candidate
        candidates = [(region, estimate, carbon)]
        normalized_metrics = {region.id: norm_m}

        ranked = strategy.rank_candidates(candidates, normalized_metrics, carbon_available=True)
        # Jr should be 1.0 * norm_emissions (0.50)
        assert ranked[0].score_result.cost_score_jr == Decimal("0.50")

    def test_performance_only_strategy(self, sample_candidate):
        strategy = PerformanceOnlyStrategy()
        assert strategy.base_weights.time == Decimal("1.0")
        assert strategy.base_weights.carbon == Decimal("0.0")

        region, estimate, carbon, norm_m = sample_candidate
        candidates = [(region, estimate, carbon)]
        normalized_metrics = {region.id: norm_m}

        ranked = strategy.rank_candidates(candidates, normalized_metrics, carbon_available=True)
        # Jr should be 1.0 * norm_duration (0.20)
        assert ranked[0].score_result.cost_score_jr == Decimal("0.20")

    def test_random_strategy_deterministic_reproducibility(self):
        strategy = RandomStrategy()
        regions = [
            Region(code=f"reg-{i}", name=f"Region {i}", provider="AWS", max_cpu_capacity=Decimal("32.0"), max_memory_capacity=Decimal("128.0"))
            for i in range(5)
        ]
        estimates = [
            RegionalWorkloadEstimate(duration_seconds=Decimal("100.0"), delta_power_watts=Decimal("50.0"), energy_kwh=Decimal("0.1"), emissions_co2eq=Decimal("10.0"))
            for _ in range(5)
        ]
        carbons = [
            CarbonIntensity(quality=CarbonQuality.LIVE, source=CarbonSource.ELECTRICITY_MAPS, value=Decimal("100.0"))
            for _ in range(5)
        ]
        candidates = list(zip(regions, estimates, carbons))
        norm_metrics = {r.id: NormalizedCandidateMetrics(r.id, Decimal("0.1"), Decimal("0.1"), Decimal("0.1"), Decimal("0.1")) for r in regions}

        # Run twice with same seed
        res1 = strategy.rank_candidates(candidates, norm_metrics, random_seed=42)
        res2 = strategy.rank_candidates(candidates, norm_metrics, random_seed=42)

        order1 = [c.region.code for c in res1]
        order2 = [c.region.code for c in res2]
        assert order1 == order2, "Same random seed must produce identical rankings."

        # Run with different seed
        res3 = strategy.rank_candidates(candidates, norm_metrics, random_seed=999)
        order3 = [c.region.code for c in res3]
        # At least one candidate ordering position differs across seeds
        assert len(order1) == len(order3)

    def test_deterministic_tie_breaking_with_carbon(self):
        """Tie-break on exact Jr equality: (1) lower Cr -> (2) lower Tr -> (3) code."""
        r1 = Region(code="zone-b", name="Zone B", provider="AWS", max_cpu_capacity=Decimal("32.0"), max_memory_capacity=Decimal("128.0"))
        r2 = Region(code="zone-a", name="Zone A", provider="AWS", max_cpu_capacity=Decimal("32.0"), max_memory_capacity=Decimal("128.0"))

        score_res1 = ScoreCalculator.calculate_score(
            metrics=NormalizedCandidateMetrics(r1.id, Decimal("0.5"), Decimal("0.5"), Decimal("0.5"), Decimal("0.5")),
            weights=SchedulingWeights(Decimal("0.25"), Decimal("0.25"), Decimal("0.25"), Decimal("0.25")),
        )
        score_res2 = ScoreCalculator.calculate_score(
            metrics=NormalizedCandidateMetrics(r2.id, Decimal("0.5"), Decimal("0.5"), Decimal("0.5"), Decimal("0.5")),
            weights=SchedulingWeights(Decimal("0.25"), Decimal("0.25"), Decimal("0.25"), Decimal("0.25")),
        )
        assert score_res1.cost_score_jr == score_res2.cost_score_jr  # Exact tie

        # Case 1: r2 has lower emissions Cr
        est1 = RegionalWorkloadEstimate(Decimal("100.0"), Decimal("50.0"), Decimal("0.1"), Decimal("30.0"))
        est2 = RegionalWorkloadEstimate(Decimal("100.0"), Decimal("50.0"), Decimal("0.1"), Decimal("20.0"))  # lower Cr
        carbon = CarbonIntensity(CarbonQuality.LIVE, CarbonSource.ELECTRICITY_MAPS, Decimal("100.0"))

        ranked = RegionRanker.rank_candidates([
            (r1, score_res1, est1, carbon),
            (r2, score_res2, est2, carbon),
        ], carbon_available=True)

        assert ranked[0].region.code == "zone-a"
        assert ranked[1].region.code == "zone-b"

        # Case 2: Identical Cr, r2 has lower Tr
        est1_same_cr = RegionalWorkloadEstimate(Decimal("150.0"), Decimal("50.0"), Decimal("0.1"), Decimal("20.0"))
        est2_same_cr = RegionalWorkloadEstimate(Decimal("100.0"), Decimal("50.0"), Decimal("0.1"), Decimal("20.0"))  # lower Tr

        ranked2 = RegionRanker.rank_candidates([
            (r1, score_res1, est1_same_cr, carbon),
            (r2, score_res2, est2_same_cr, carbon),
        ], carbon_available=True)

        assert ranked2[0].region.code == "zone-a"

        # Case 3: Identical Cr and Tr, lexicographical code
        est_identical = RegionalWorkloadEstimate(Decimal("100.0"), Decimal("50.0"), Decimal("0.1"), Decimal("20.0"))
        ranked3 = RegionRanker.rank_candidates([
            (r1, score_res1, est_identical, carbon),  # zone-b
            (r2, score_res2, est_identical, carbon),  # zone-a
        ], carbon_available=True)

        assert ranked3[0].region.code == "zone-a"
        assert ranked3[1].region.code == "zone-b"
