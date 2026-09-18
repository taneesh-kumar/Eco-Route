"""Deterministic energy and carbon emissions estimation using modeled power curves."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from app.domain.carbon import CarbonIntensity
from app.domain.region import Region
from app.domain.values import WorkloadDemand

JOULES_PER_KWH = Decimal("3600000")


@dataclass(frozen=True)
class RegionalWorkloadEstimate:
    """Calculated execution duration, differential power, energy, and emissions for a region."""
    duration_seconds: Decimal  # T_r
    delta_power_watts: Decimal  # ΔP
    energy_kwh: Decimal  # E_r
    emissions_co2eq: Optional[Decimal] = None  # C_r
    u_before: Optional[Decimal] = None
    u_after: Optional[Decimal] = None


class EnergyEstimator:
    """Pure mathematical calculator for regional duration, power, energy, and emissions.

    Zero framework or external dependencies.
    """

    @staticmethod
    def calculate_duration(base_duration: Decimal, performance_factor: Decimal) -> Decimal:
        """Calculates workload execution duration scaled by regional performance factor:

        T_r = T_base / PerformanceFactor_r
        """
        t_base = Decimal(str(base_duration))
        perf = Decimal(str(performance_factor))
        if perf <= Decimal("0"):
            raise ValueError(f"Performance factor must be > 0, got {perf}")
        return t_base / perf

    @staticmethod
    def calculate_power(idle_power: Decimal, peak_power: Decimal, utilization: Decimal) -> Decimal:
        """Calculates regional power draw at utilization U:

        P(U) = P_idle + (P_peak - P_idle) * U
        """
        p_idle = Decimal(str(idle_power))
        p_peak = Decimal(str(peak_power))
        u = Decimal(str(utilization))
        if not (Decimal("0") <= u <= Decimal("1")):
            raise ValueError(f"Utilization must be in range [0, 1], got {u}")
        if p_peak < p_idle:
            raise ValueError(f"Peak power ({p_peak}) must be >= idle power ({p_idle})")
        return p_idle + (p_peak - p_idle) * u

    @staticmethod
    def calculate_delta_power(
        idle_power: Decimal,
        peak_power: Decimal,
        cpu_demand: Decimal,
        max_cpu_capacity: Decimal,
    ) -> Decimal:
        """Calculates differential workload power draw:

        ΔP = (P_peak - P_idle) * (cpu_demand / max_cpu_capacity)
        """
        p_idle = Decimal(str(idle_power))
        p_peak = Decimal(str(peak_power))
        demand = Decimal(str(cpu_demand))
        max_cpu = Decimal(str(max_cpu_capacity))

        if max_cpu <= Decimal("0"):
            raise ValueError(f"max_cpu_capacity must be > 0, got {max_cpu}")
        if demand <= Decimal("0"):
            raise ValueError(f"cpu_demand must be > 0, got {demand}")

        return (p_peak - p_idle) * (demand / max_cpu)

    @staticmethod
    def calculate_energy(delta_power_watts: Decimal, duration_seconds: Decimal) -> Decimal:
        """Calculates total estimated energy in kWh:

        E_r = (ΔP * T_r) / 3,600,000
        """
        dp = Decimal(str(delta_power_watts))
        dur = Decimal(str(duration_seconds))
        return (dp * dur) / JOULES_PER_KWH

    @classmethod
    def estimate_for_region(
        cls,
        demand: WorkloadDemand,
        region: Region,
        carbon: Optional[CarbonIntensity] = None,
    ) -> RegionalWorkloadEstimate:
        """Computes complete regional workload estimate (T_r, ΔP, E_r, C_r, U_before, U_after)."""
        duration = cls.calculate_duration(
            demand.base_execution_duration,
            region.performance_factor,
        )

        delta_power = cls.calculate_delta_power(
            idle_power=region.idle_power_watts,
            peak_power=region.peak_power_watts,
            cpu_demand=demand.cpu_demand,
            max_cpu_capacity=region.max_cpu_capacity,
        )

        energy_kwh = cls.calculate_energy(delta_power, duration)

        u_before = region.current_utilization
        u_after = u_before + (demand.cpu_demand / region.max_cpu_capacity)

        # Emissions calculation: C_r = E_r * CI_r
        # Zero fabrication invariant: If carbon is None or unavailable, emissions = None
        emissions: Optional[Decimal] = None
        if carbon is not None and carbon.value is not None:
            emissions = energy_kwh * carbon.value

        return RegionalWorkloadEstimate(
            duration_seconds=duration,
            delta_power_watts=delta_power,
            energy_kwh=energy_kwh,
            emissions_co2eq=emissions,
            u_before=u_before,
            u_after=u_after,
        )
