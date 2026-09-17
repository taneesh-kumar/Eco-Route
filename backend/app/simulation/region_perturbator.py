"""Simulated regional dynamics and carbon scenario perturbations."""

import copy
from decimal import Decimal
import random
from typing import Dict, List
import uuid

from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.region import Region as DomainRegion


class RegionScenario:
    """Encapsulates a cloned regional infrastructure scenario for benchmark evaluation."""

    def __init__(
        self,
        regions: List[DomainRegion],
        carbon_map: Dict[uuid.UUID, CarbonIntensity],
    ):
        self.regions = regions
        self.carbon_map = carbon_map

    def clone(self) -> "RegionScenario":
        """Performs a deep clone of the regional scenario to guarantee isolation."""
        cloned_regions = [
            DomainRegion(
                id=r.id,
                code=r.code,
                name=r.name,
                provider=r.provider,
                max_cpu_capacity=r.max_cpu_capacity,
                max_memory_capacity=r.max_memory_capacity,
                current_utilization=r.current_utilization,
                performance_factor=r.performance_factor,
                idle_power_watts=r.idle_power_watts,
                peak_power_watts=r.peak_power_watts,
                network_latency_ms=r.network_latency_ms,
                is_available=r.is_available,
                is_active=r.is_active,
            )
            for r in self.regions
        ]
        cloned_carbon = {
            r_id: CarbonIntensity(
                quality=ci.quality,
                source=ci.source,
                value=ci.value,
            )
            for r_id, ci in self.carbon_map.items()
        }
        return RegionScenario(regions=cloned_regions, carbon_map=cloned_carbon)


class RegionPerturbator:
    """Generates synthetic regional baselines and dynamic perturbations."""

    @staticmethod
    def create_baseline_scenario(
        seed: int = 42,
    ) -> RegionScenario:
        """Creates a standardized 5-region global topology with varied green and brown grids."""
        rng = random.Random(seed)

        region_defs = [
            ("se-sto", "Sweden Central", "AWS", Decimal("64.0"), Decimal("256.0"), Decimal("1.2"), Decimal("120.0"), Decimal("400.0"), Decimal("25.0"), Decimal("45.0")),
            ("fr-par", "France West", "AWS", Decimal("64.0"), Decimal("256.0"), Decimal("1.0"), Decimal("100.0"), Decimal("450.0"), Decimal("15.0"), Decimal("85.0")),
            ("de-fra", "Germany Central", "AWS", Decimal("128.0"), Decimal("512.0"), Decimal("1.3"), Decimal("150.0"), Decimal("600.0"), Decimal("10.0"), Decimal("380.0")),
            ("us-east", "US East (N. Virginia)", "AWS", Decimal("128.0"), Decimal("512.0"), Decimal("1.1"), Decimal("130.0"), Decimal("550.0"), Decimal("35.0"), Decimal("420.0")),
            ("pl-war", "Poland Central", "AWS", Decimal("32.0"), Decimal("128.0"), Decimal("0.9"), Decimal("90.0"), Decimal("380.0"), Decimal("40.0"), Decimal("680.0")),
        ]

        regions: List[DomainRegion] = []
        carbon_map: Dict[uuid.UUID, CarbonIntensity] = {}

        for code, name, provider, max_cpu, max_mem, perf, p_idle, p_peak, lat, base_ci in region_defs:
            r_id = uuid.uuid4()
            util = Decimal(str(rng.uniform(0.15, 0.45))).quantize(Decimal("0.0001"))
            reg = DomainRegion(
                id=r_id,
                code=code,
                name=name,
                provider=provider,
                max_cpu_capacity=max_cpu,
                max_memory_capacity=max_mem,
                current_utilization=util,
                performance_factor=perf,
                idle_power_watts=p_idle,
                peak_power_watts=p_peak,
                network_latency_ms=lat,
                is_available=True,
                is_active=True,
            )
            regions.append(reg)
            carbon_map[r_id] = CarbonIntensity(
                quality=CarbonQuality.LIVE,
                source=CarbonSource.ELECTRICITY_MAPS,
                value=base_ci,
            )

        return RegionScenario(regions=regions, carbon_map=carbon_map)
