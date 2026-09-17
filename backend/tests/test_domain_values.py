"""Pure unit tests for domain value objects and carbon quality models."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest

from app.domain.carbon import (
    CarbonIntensity,
    CarbonQuality,
    CarbonSource,
)
from app.domain.exceptions import (
    InvalidJobConfigurationError,
    InvalidSchedulingDecisionError,
    ZeroCarbonFabricationError,
)
from app.domain.values import (
    DeadlineSlack,
    JobPriority,
    SchedulingWeights,
    WorkloadDemand,
)


class TestWorkloadDemand:
    """Test WorkloadDemand boundary and invariant checks."""

    def test_valid_workload_demand(self):
        demand = WorkloadDemand(
            cpu_demand=Decimal("4.0"),
            memory_demand=Decimal("16.0"),
            base_execution_duration=Decimal("300.0"),
        )
        assert demand.cpu_demand == Decimal("4.0")
        assert demand.memory_demand == Decimal("16.0")
        assert demand.base_execution_duration == Decimal("300.0")

    @pytest.mark.parametrize(
        "cpu, mem, dur",
        [
            (Decimal("0.0"), Decimal("16.0"), Decimal("300.0")),
            (Decimal("-1.0"), Decimal("16.0"), Decimal("300.0")),
            (Decimal("4.0"), Decimal("0.0"), Decimal("300.0")),
            (Decimal("4.0"), Decimal("-5.0"), Decimal("300.0")),
            (Decimal("4.0"), Decimal("16.0"), Decimal("0.0")),
            (Decimal("4.0"), Decimal("16.0"), Decimal("-10.0")),
        ],
    )
    def test_invalid_workload_demand_raises(self, cpu, mem, dur):
        with pytest.raises(InvalidJobConfigurationError):
            WorkloadDemand(
                cpu_demand=cpu,
                memory_demand=mem,
                base_execution_duration=dur,
            )


class TestJobPriority:
    """Test JobPriority integer range [1..10]."""

    @pytest.mark.parametrize("p", [1, 2, 5, 9, 10])
    def test_valid_priority(self, p: int):
        priority = JobPriority(value=p)
        assert priority.value == p

    @pytest.mark.parametrize("p", [0, -1, 11, 100])
    def test_invalid_priority_range_raises(self, p: int):
        with pytest.raises(InvalidJobConfigurationError):
            JobPriority(value=p)

    def test_non_integer_priority_raises(self):
        with pytest.raises(InvalidJobConfigurationError):
            JobPriority(value="invalid")  # type: ignore


class TestSchedulingWeights:
    """Test multi-objective SchedulingWeights invariants."""

    def test_valid_weights(self):
        weights = SchedulingWeights(
            carbon=Decimal("0.40"),
            time=Decimal("0.30"),
            utilization=Decimal("0.20"),
            latency=Decimal("0.10"),
        )
        assert weights.carbon == Decimal("0.40")
        assert weights.time == Decimal("0.30")
        assert weights.utilization == Decimal("0.20")
        assert weights.latency == Decimal("0.10")

    def test_negative_weight_raises(self):
        with pytest.raises(InvalidSchedulingDecisionError):
            SchedulingWeights(
                carbon=Decimal("-0.10"),
                time=Decimal("0.50"),
                utilization=Decimal("0.30"),
                latency=Decimal("0.30"),
            )

    def test_sum_not_one_raises(self):
        with pytest.raises(InvalidSchedulingDecisionError):
            SchedulingWeights(
                carbon=Decimal("0.50"),
                time=Decimal("0.50"),
                utilization=Decimal("0.20"),
                latency=Decimal("0.10"),
            )

    def test_no_conventional_fallback_method_exists(self):
        """Correction #4: Do not implement SchedulingWeights.to_conventional_fallback()."""
        weights = SchedulingWeights(
            carbon=Decimal("0.25"),
            time=Decimal("0.25"),
            utilization=Decimal("0.25"),
            latency=Decimal("0.25"),
        )
        assert not hasattr(weights, "to_conventional_fallback")


class TestDeadlineSlack:
    """Test DeadlineSlack calculations using the finalized formula:

    Slack = Deadline - CurrentTime - EstimatedExecutionTime
    """

    def test_deadline_slack_formula(self):
        now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=timezone.utc)
        deadline = now + timedelta(seconds=600)  # 600s in future
        duration = Decimal("200.0")  # 200s duration

        slack = DeadlineSlack(
            deadline=deadline,
            current_time=now,
            estimated_execution_time=duration,
        )
        # Expected: 600 - 200 = 400s
        assert slack.slack_seconds == Decimal("400.0")
        assert slack.is_exhausted is False
        assert slack.is_safe_for_deferral(min_window_seconds=Decimal("300")) is True
        assert slack.is_safe_for_deferral(min_window_seconds=Decimal("500")) is False

    def test_zero_and_negative_slack(self):
        now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=timezone.utc)
        deadline = now + timedelta(seconds=200)

        # Zero slack: deadline - now = 200, duration = 200 -> slack = 0
        slack_zero = DeadlineSlack(
            deadline=deadline,
            current_time=now,
            estimated_execution_time=Decimal("200.0"),
        )
        assert slack_zero.slack_seconds == Decimal("0.0")
        assert slack_zero.is_exhausted is True
        assert slack_zero.is_safe_for_deferral() is False

        # Negative slack: duration = 250 -> slack = -50
        slack_neg = DeadlineSlack(
            deadline=deadline,
            current_time=now,
            estimated_execution_time=Decimal("250.0"),
        )
        assert slack_neg.slack_seconds == Decimal("-50.0")
        assert slack_neg.is_exhausted is True
        assert slack_neg.is_safe_for_deferral() is False


class TestCarbonModels:
    """Test CarbonQuality and CarbonIntensity zero-fabrication invariants."""

    def test_carbon_quality_enum_values(self):
        """Correction #3: Carbon quality must distinguish LIVE, VALID_CACHE, CONVENTIONAL_FALLBACK, UNAVAILABLE."""
        assert CarbonQuality.LIVE.value == "LIVE"
        assert CarbonQuality.VALID_CACHE.value == "VALID_CACHE"
        assert CarbonQuality.CONVENTIONAL_FALLBACK.value == "CONVENTIONAL_FALLBACK"
        assert CarbonQuality.UNAVAILABLE.value == "UNAVAILABLE"

    def test_live_carbon_valid(self):
        intensity = CarbonIntensity(
            quality=CarbonQuality.LIVE,
            source=CarbonSource.ELECTRICITY_MAPS,
            value=Decimal("125.50"),
        )
        assert intensity.value == Decimal("125.50")
        assert intensity.is_trustworthy is True

    def test_valid_cache_carbon_valid(self):
        intensity = CarbonIntensity(
            quality=CarbonQuality.VALID_CACHE,
            source=CarbonSource.REGIONAL_PROFILE,
            value=Decimal("210.00"),
        )
        assert intensity.value == Decimal("210.00")
        assert intensity.is_trustworthy is True

    def test_live_with_none_raises_zero_fabrication(self):
        with pytest.raises(ZeroCarbonFabricationError):
            CarbonIntensity(
                quality=CarbonQuality.LIVE,
                source=CarbonSource.ELECTRICITY_MAPS,
                value=None,
            )

    def test_valid_cache_with_none_raises_zero_fabrication(self):
        with pytest.raises(ZeroCarbonFabricationError):
            CarbonIntensity(
                quality=CarbonQuality.VALID_CACHE,
                source=CarbonSource.ELECTRICITY_MAPS,
                value=None,
            )

    def test_unavailable_must_be_none(self):
        """UNAVAILABLE never becomes zero, average, guessed, or fabricated carbon."""
        unavailable = CarbonIntensity(
            quality=CarbonQuality.UNAVAILABLE,
            source=CarbonSource.ELECTRICITY_MAPS,
            value=None,
        )
        assert unavailable.value is None
        assert unavailable.is_trustworthy is False

        # Attempting to assign 0.0 or any guessed value to UNAVAILABLE raises ZeroCarbonFabricationError
        with pytest.raises(ZeroCarbonFabricationError):
            CarbonIntensity(
                quality=CarbonQuality.UNAVAILABLE,
                source=CarbonSource.ELECTRICITY_MAPS,
                value=Decimal("0.0"),
            )

        with pytest.raises(ZeroCarbonFabricationError):
            CarbonIntensity(
                quality=CarbonQuality.UNAVAILABLE,
                source=CarbonSource.ELECTRICITY_MAPS,
                value=Decimal("150.0"),
            )

    def test_conventional_fallback_must_be_none(self):
        fallback = CarbonIntensity(
            quality=CarbonQuality.CONVENTIONAL_FALLBACK,
            source=CarbonSource.REGIONAL_PROFILE,
            value=None,
        )
        assert fallback.value is None
        assert fallback.is_trustworthy is False

        with pytest.raises(ZeroCarbonFabricationError):
            CarbonIntensity(
                quality=CarbonQuality.CONVENTIONAL_FALLBACK,
                source=CarbonSource.REGIONAL_PROFILE,
                value=Decimal("100.0"),
            )

    def test_negative_carbon_raises(self):
        with pytest.raises(ZeroCarbonFabricationError):
            CarbonIntensity(
                quality=CarbonQuality.LIVE,
                source=CarbonSource.ELECTRICITY_MAPS,
                value=Decimal("-10.0"),
            )
