"""Pure unit tests for Normalizer and metric bounds."""

from decimal import Decimal
import uuid
import pytest

from app.scheduling.normalizer import MetricBounds, Normalizer


class TestNormalizer:
    """Test suite for Min-Max normalization and verified edge cases."""

    def test_metric_bounds_normalize(self):
        bounds = MetricBounds(min_val=Decimal("10.0"), max_val=Decimal("50.0"))
        # (10 - 10) / 40 = 0.0
        assert bounds.normalize(Decimal("10.0")) == Decimal("0.0")
        # (50 - 10) / 40 = 1.0
        assert bounds.normalize(Decimal("50.0")) == Decimal("1.0")
        # (30 - 10) / 40 = 0.5
        assert bounds.normalize(Decimal("30.0")) == Decimal("0.5")

    def test_metric_bounds_equal_min_max_edge_case(self):
        """Finalized rule: If x_max == x_min, N(x_r) = 0.0."""
        bounds = MetricBounds(min_val=Decimal("100.0"), max_val=Decimal("100.0"))
        assert bounds.normalize(Decimal("100.0")) == Decimal("0.0")

    def test_normalize_multiple_candidates(self):
        r1 = uuid.uuid4()
        r2 = uuid.uuid4()
        r3 = uuid.uuid4()

        raw_metrics = {
            r1: {
                "duration": Decimal("100.0"),
                "utilization": Decimal("0.20"),
                "latency": Decimal("10.0"),
                "emissions": Decimal("50.0"),
            },
            r2: {
                "duration": Decimal("200.0"),
                "utilization": Decimal("0.50"),
                "latency": Decimal("50.0"),
                "emissions": Decimal("150.0"),
            },
            r3: {
                "duration": Decimal("300.0"),
                "utilization": Decimal("0.80"),
                "latency": Decimal("90.0"),
                "emissions": Decimal("250.0"),
            },
        }

        normalized, factors = Normalizer.normalize_candidates(raw_metrics)

        # r1 is minimum across all metrics -> all normalized to 0.0
        assert normalized[r1].norm_duration == Decimal("0.0")
        assert normalized[r1].norm_utilization == Decimal("0.0")
        assert normalized[r1].norm_latency == Decimal("0.0")
        assert normalized[r1].norm_emissions == Decimal("0.0")

        # r3 is maximum across all metrics -> all normalized to 1.0
        assert normalized[r3].norm_duration == Decimal("1.0")
        assert normalized[r3].norm_utilization == Decimal("1.0")
        assert normalized[r3].norm_latency == Decimal("1.0")
        assert normalized[r3].norm_emissions == Decimal("1.0")

        # r2 is middle -> normalized to 0.5
        assert normalized[r2].norm_duration == Decimal("0.5")
        assert normalized[r2].norm_utilization == Decimal("0.5")
        assert normalized[r2].norm_latency == Decimal("0.5")
        assert normalized[r2].norm_emissions == Decimal("0.5")

    def test_single_feasible_candidate_edge_case(self):
        """When exactly one feasible candidate exists, all normalized metrics must be 0.0."""
        r1 = uuid.uuid4()
        raw_metrics = {
            r1: {
                "duration": Decimal("250.0"),
                "utilization": Decimal("0.40"),
                "latency": Decimal("30.0"),
                "emissions": Decimal("120.0"),
            }
        }

        normalized, factors = Normalizer.normalize_candidates(raw_metrics)
        assert normalized[r1].norm_duration == Decimal("0.0")
        assert normalized[r1].norm_utilization == Decimal("0.0")
        assert normalized[r1].norm_latency == Decimal("0.0")
        assert normalized[r1].norm_emissions == Decimal("0.0")

    def test_uniform_metrics_across_candidates(self):
        """When multiple candidates have identical metric values, normalized metric must be 0.0."""
        r1 = uuid.uuid4()
        r2 = uuid.uuid4()
        raw_metrics = {
            r1: {
                "duration": Decimal("150.0"),
                "utilization": Decimal("0.50"),  # identical
                "latency": Decimal("20.0"),
                "emissions": Decimal("100.0"),
            },
            r2: {
                "duration": Decimal("300.0"),
                "utilization": Decimal("0.50"),  # identical
                "latency": Decimal("80.0"),
                "emissions": Decimal("200.0"),
            },
        }

        normalized, factors = Normalizer.normalize_candidates(raw_metrics)
        # Utilization identical -> 0.0 for both
        assert normalized[r1].norm_utilization == Decimal("0.0")
        assert normalized[r2].norm_utilization == Decimal("0.0")
        # Other metrics vary
        assert normalized[r1].norm_duration == Decimal("0.0")
        assert normalized[r2].norm_duration == Decimal("1.0")

    def test_empty_candidates(self):
        normalized, factors = Normalizer.normalize_candidates({})
        assert normalized == {}
        assert factors == {}
