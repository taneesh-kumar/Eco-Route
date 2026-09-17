"""Pure unit tests for EnergyEstimator mathematical models."""

from decimal import Decimal
import pytest

from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.region import Region
from app.domain.values import WorkloadDemand
from app.scheduling.energy_estimator import EnergyEstimator


class TestEnergyEstimator:
    """Test suite for workload duration, power curves, energy, and emissions estimation."""

    def test_calculate_duration(self):
        # 300 seconds base, performance factor 1.5 -> 200 seconds
        duration = EnergyEstimator.calculate_duration(Decimal("300.0"), Decimal("1.5"))
        assert duration == Decimal("200.0")

        # Performance factor 1.0 -> 300 seconds
        assert EnergyEstimator.calculate_duration(Decimal("300.0"), Decimal("1.0")) == Decimal("300.0")

        # Performance factor <= 0 raises ValueError
        with pytest.raises(ValueError):
            EnergyEstimator.calculate_duration(Decimal("300.0"), Decimal("0.0"))

    def test_calculate_power(self):
        # Idle = 50W, Peak = 250W
        # At U = 0.0 -> 50W
        assert EnergyEstimator.calculate_power(Decimal("50.0"), Decimal("250.0"), Decimal("0.0")) == Decimal("50.0")
        # At U = 1.0 -> 250W
        assert EnergyEstimator.calculate_power(Decimal("50.0"), Decimal("250.0"), Decimal("1.0")) == Decimal("250.0")
        # At U = 0.5 -> 50 + 200 * 0.5 = 150W
        assert EnergyEstimator.calculate_power(Decimal("50.0"), Decimal("250.0"), Decimal("0.5")) == Decimal("150.0")

        # Peak < Idle raises
        with pytest.raises(ValueError):
            EnergyEstimator.calculate_power(Decimal("100.0"), Decimal("50.0"), Decimal("0.5"))

        # Utilization out of bounds raises
        with pytest.raises(ValueError):
            EnergyEstimator.calculate_power(Decimal("50.0"), Decimal("250.0"), Decimal("1.2"))

    def test_calculate_delta_power(self):
        # Peak = 250, Idle = 50 -> Range = 200W
        # CPU demand = 8, Max CPU = 32 -> Fraction = 8/32 = 0.25
        # ΔP = 200 * 0.25 = 50W
        dp = EnergyEstimator.calculate_delta_power(
            idle_power=Decimal("50.0"),
            peak_power=Decimal("250.0"),
            cpu_demand=Decimal("8.0"),
            max_cpu_capacity=Decimal("32.0"),
        )
        assert dp == Decimal("50.0")

    def test_calculate_energy(self):
        # ΔP = 100W, Duration = 3600s (1 hour)
        # 100W * 3600s = 360,000 Joules = 0.1 kWh
        energy = EnergyEstimator.calculate_energy(Decimal("100.0"), Decimal("3600.0"))
        assert energy == Decimal("0.1")

    def test_estimate_for_region_with_carbon(self):
        demand = WorkloadDemand(
            cpu_demand=Decimal("16.0"),
            memory_demand=Decimal("32.0"),
            base_execution_duration=Decimal("7200.0"),  # 2 hours
        )
        region = Region(
            code="us-east-1",
            name="US East",
            provider="AWS",
            max_cpu_capacity=Decimal("64.0"),
            max_memory_capacity=Decimal("256.0"),
            performance_factor=Decimal("2.0"),  # 7200 / 2 = 3600s
            idle_power_watts=Decimal("100.0"),
            peak_power_watts=Decimal("500.0"),  # ΔP = 400 * (16/64) = 100W
        )
        carbon = CarbonIntensity(
            quality=CarbonQuality.LIVE,
            source=CarbonSource.ELECTRICITY_MAPS,
            value=Decimal("250.0"),  # 250 gCO2eq/kWh
        )

        estimate = EnergyEstimator.estimate_for_region(demand, region, carbon)
        assert estimate.duration_seconds == Decimal("3600.0")
        assert estimate.delta_power_watts == Decimal("100.0")
        assert estimate.energy_kwh == Decimal("0.1")
        # Emissions: 0.1 kWh * 250 g/kWh = 25.0 gCO2eq
        assert estimate.emissions_co2eq == Decimal("25.0")

    def test_estimate_for_region_without_carbon_zero_fabrication(self):
        demand = WorkloadDemand(
            cpu_demand=Decimal("8.0"),
            memory_demand=Decimal("16.0"),
            base_execution_duration=Decimal("1800.0"),
        )
        region = Region(
            code="eu-west-1",
            name="EU West",
            provider="AWS",
            max_cpu_capacity=Decimal("32.0"),
            max_memory_capacity=Decimal("128.0"),
            performance_factor=Decimal("1.0"),
            idle_power_watts=Decimal("50.0"),
            peak_power_watts=Decimal("250.0"),
        )
        carbon_unavail = CarbonIntensity(
            quality=CarbonQuality.UNAVAILABLE,
            source=CarbonSource.ELECTRICITY_MAPS,
            value=None,
        )

        estimate = EnergyEstimator.estimate_for_region(demand, region, carbon_unavail)
        assert estimate.duration_seconds == Decimal("1800.0")
        assert estimate.energy_kwh > Decimal("0")
        # Zero fabrication invariant: emissions MUST be None, never 0.0 or estimated
        assert estimate.emissions_co2eq is None
