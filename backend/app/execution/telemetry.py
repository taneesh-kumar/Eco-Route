"""Observed execution telemetry calculation enforcing zero-carbon fabrication."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from app.domain.carbon import CarbonIntensity, CarbonQuality
from app.domain.region import Region
from app.domain.values import WorkloadDemand


@dataclass(frozen=True)
class ObservedTelemetry:
    """Execution telemetry captured after workload completion."""
    actual_duration_seconds: Decimal
    actual_energy_kwh: Decimal
    actual_co2eq_grams: Optional[Decimal]
    carbon_quality_used: CarbonQuality


class ExecutionTelemetry:
    """Calculates observed telemetry for completed workload attempts.

    Guarantees:
    - Zero fabrication: if carbon is UNAVAILABLE or untrusted, emissions are None.
    - Explicit distinction between scheduling estimates and observed execution values.
    """

    @staticmethod
    def calculate_observed(
        demand: WorkloadDemand,
        region: Region,
        carbon: Optional[CarbonIntensity] = None,
        duration_variance_factor: Decimal = Decimal("1.0"),
    ) -> ObservedTelemetry:
        """Calculates observed duration, energy, and emissions.

        duration_variance_factor allows simulation of slight runtime variances (default 1.0).
        """
        # Actual duration: T_base / PerformanceFactor * variance
        base_dur = demand.base_execution_duration
        perf = region.performance_factor
        actual_duration = (base_dur / perf) * duration_variance_factor

        # Workload power delta: (P_peak - P_idle) * (cpu_demand / max_cpu_capacity)
        power_range = region.peak_power_watts - region.idle_power_watts
        cpu_ratio = demand.cpu_demand / region.max_cpu_capacity
        delta_power = power_range * cpu_ratio

        # Actual energy in kWh: delta_power * actual_duration / 3,600,000
        actual_energy_kwh = (delta_power * actual_duration) / Decimal("3600000")

        # Zero-fabrication emissions rule
        actual_co2eq_grams: Optional[Decimal] = None
        quality = CarbonQuality.UNAVAILABLE

        if carbon is not None and carbon.is_trustworthy and carbon.value is not None:
            actual_co2eq_grams = actual_energy_kwh * carbon.value
            quality = carbon.quality

        return ObservedTelemetry(
            actual_duration_seconds=actual_duration.quantize(Decimal("0.01")),
            actual_energy_kwh=actual_energy_kwh.quantize(Decimal("0.000001")),
            actual_co2eq_grams=(
                actual_co2eq_grams.quantize(Decimal("0.0001"))
                if actual_co2eq_grams is not None
                else None
            ),
            carbon_quality_used=quality,
        )
