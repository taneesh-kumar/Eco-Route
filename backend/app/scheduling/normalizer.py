"""Min-Max Normalization across the feasible candidate set."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, List, Optional
import uuid


@dataclass(frozen=True)
class MetricBounds:
    """Min and max bounds for a specific lower-is-better metric across feasible candidates."""
    min_val: Decimal
    max_val: Decimal

    def normalize(self, value: Decimal) -> Decimal:
        """Normalizes value using:

        N(x) = (x - x_min) / (x_max - x_min) if x_max > x_min else 0.0
        """
        val = Decimal(str(value))
        if self.max_val > self.min_val:
            norm = (val - self.min_val) / (self.max_val - self.min_val)
            # Guard against tiny rounding overshoot beyond [0, 1]
            return max(Decimal("0.0"), min(Decimal("1.0"), norm))
        return Decimal("0.0")

    def to_dict(self) -> Dict[str, str]:
        """Serializes bounds for explainability records."""
        return {
            "min": str(self.min_val),
            "max": str(self.max_val),
        }


@dataclass(frozen=True)
class NormalizedCandidateMetrics:
    """Normalized metrics for a single feasible candidate region."""
    region_id: uuid.UUID
    norm_duration: Decimal  # N(T_r)
    norm_utilization: Decimal  # N(U_r)
    norm_latency: Decimal  # N(L_r)
    norm_emissions: Optional[Decimal]  # N(C_r) if carbon available, else None


class Normalizer:
    """Computes min-max normalization bounds and normalized scores for feasible regions.

    Invariants:
    - Scoped strictly to the feasible candidate set.
    - If x_max == x_min, N(x_r) = 0.0.
    - If single feasible region, N(x_r) = 0.0 for all metrics.
    """

    @staticmethod
    def _compute_bounds(values: List[Decimal]) -> MetricBounds:
        if not values:
            return MetricBounds(min_val=Decimal("0.0"), max_val=Decimal("0.0"))
        return MetricBounds(
            min_val=min(values),
            max_val=max(values),
        )

    @classmethod
    def normalize_candidates(
        cls,
        raw_metrics: Dict[uuid.UUID, Dict[str, Optional[Decimal]]],
    ) -> tuple[Dict[uuid.UUID, NormalizedCandidateMetrics], Dict[str, Dict[str, str]]]:
        """Normalizes raw metrics for all feasible candidate regions.

        Input raw_metrics dict maps region_id to:
        {
            "duration": Decimal,
            "utilization": Decimal,
            "latency": Decimal,
            "emissions": Optional[Decimal]
        }

        Returns:
            (normalized_metrics_by_region, normalization_factors_dict)
        """
        if not raw_metrics:
            return {}, {}

        durations = [m["duration"] for m in raw_metrics.values() if m.get("duration") is not None]  # type: ignore
        utilizations = [m["utilization"] for m in raw_metrics.values() if m.get("utilization") is not None]  # type: ignore
        latencies = [m["latency"] for m in raw_metrics.values() if m.get("latency") is not None]  # type: ignore
        emissions_list = [m["emissions"] for m in raw_metrics.values() if m.get("emissions") is not None]  # type: ignore

        dur_bounds = cls._compute_bounds(durations)
        util_bounds = cls._compute_bounds(utilizations)
        lat_bounds = cls._compute_bounds(latencies)
        emiss_bounds = cls._compute_bounds(emissions_list) if emissions_list else None

        normalized: Dict[uuid.UUID, NormalizedCandidateMetrics] = {}
        for r_id, m in raw_metrics.items():
            norm_dur = dur_bounds.normalize(m["duration"])  # type: ignore
            norm_util = util_bounds.normalize(m["utilization"])  # type: ignore
            norm_lat = lat_bounds.normalize(m["latency"])  # type: ignore
            norm_emiss: Optional[Decimal] = None
            if m.get("emissions") is not None and emiss_bounds is not None:
                norm_emiss = emiss_bounds.normalize(m["emissions"])  # type: ignore

            normalized[r_id] = NormalizedCandidateMetrics(
                region_id=r_id,
                norm_duration=norm_dur,
                norm_utilization=norm_util,
                norm_latency=norm_lat,
                norm_emissions=norm_emiss,
            )

        normalization_factors = {
            "duration": dur_bounds.to_dict(),
            "utilization": util_bounds.to_dict(),
            "latency": lat_bounds.to_dict(),
            "emissions": emiss_bounds.to_dict() if emiss_bounds is not None else {"min": "None", "max": "None"},
        }

        return normalized, normalization_factors
