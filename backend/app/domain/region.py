"""Region domain entity representing a simulated cloud execution target."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from app.domain.exceptions import InvalidJobConfigurationError
from app.domain.values import WorkloadDemand


class Region:
    """Represents a cloud execution target region with capacity and power characteristics.

    Enforces hard feasibility constraints only:
    - Region availability
    - Available CPU capacity >= workload demand
    - Available RAM capacity >= workload demand
    - Deadline compliance: CurrentTime + (base_duration / performance_factor) <= Deadline.

    Does NOT perform carbon scoring, energy estimation, emissions, ranking, or deferral.
    """

    def __init__(
        self,
        code: str,
        name: str,
        provider: str,
        max_cpu_capacity: Decimal,
        max_memory_capacity: Decimal,
        electricity_maps_zone: str = "",
        id: Optional[uuid.UUID] = None,
        current_utilization: Decimal = Decimal("0.0"),
        performance_factor: Decimal = Decimal("1.0"),
        idle_power_watts: Decimal = Decimal("50.0"),
        peak_power_watts: Decimal = Decimal("200.0"),
        network_latency_ms: Decimal = Decimal("0.0"),
        is_available: bool = True,
        is_active: bool = True,
    ) -> None:
        cpu = Decimal(str(max_cpu_capacity))
        mem = Decimal(str(max_memory_capacity))
        util = Decimal(str(current_utilization))
        perf = Decimal(str(performance_factor))
        idle = Decimal(str(idle_power_watts))
        peak = Decimal(str(peak_power_watts))
        lat = Decimal(str(network_latency_ms))

        if cpu <= Decimal("0"):
            raise InvalidJobConfigurationError(f"max_cpu_capacity must be > 0, got {cpu}")
        if mem <= Decimal("0"):
            raise InvalidJobConfigurationError(f"max_memory_capacity must be > 0, got {mem}")
        if not (Decimal("0.0") <= util <= Decimal("1.0")):
            raise InvalidJobConfigurationError(f"current_utilization must be between 0.0 and 1.0, got {util}")
        if perf <= Decimal("0"):
            raise InvalidJobConfigurationError(f"performance_factor must be > 0, got {perf}")
        if idle < Decimal("0"):
            raise InvalidJobConfigurationError(f"idle_power_watts must be >= 0, got {idle}")
        if peak < idle:
            raise InvalidJobConfigurationError(
                f"peak_power_watts ({peak}) must be >= idle_power_watts ({idle})"
            )
        if lat < Decimal("0"):
            raise InvalidJobConfigurationError(f"network_latency_ms must be >= 0, got {lat}")

        self.id: uuid.UUID = id or uuid.uuid4()
        self.code: str = code.strip()
        self.name: str = name.strip()
        self.provider: str = provider.strip()
        self.electricity_maps_zone: str = electricity_maps_zone.strip()
        self.max_cpu_capacity: Decimal = cpu
        self.max_memory_capacity: Decimal = mem
        self.current_utilization: Decimal = util
        self.performance_factor: Decimal = perf
        self.idle_power_watts: Decimal = idle
        self.peak_power_watts: Decimal = peak
        self.network_latency_ms: Decimal = lat
        self.is_available: bool = is_available
        self.is_active: bool = is_active

    def projected_utilization(self, cpu_demand: Decimal) -> Decimal:
        """Calculates projected utilization U_after = U_before + (cpu_demand / max_cpu_capacity)."""
        delta_u = Decimal(str(cpu_demand)) / self.max_cpu_capacity
        return self.current_utilization + delta_u

    @property
    def available_cpu(self) -> Decimal:
        """Remaining unallocated CPU cores."""
        return self.max_cpu_capacity * (Decimal("1.0") - self.current_utilization)

    @property
    def available_memory(self) -> Decimal:
        """Remaining unallocated RAM (GB)."""
        return self.max_memory_capacity * (Decimal("1.0") - self.current_utilization)

    def estimate_execution_duration(self, base_duration: Decimal) -> Decimal:
        """Calculates workload execution duration scaled by regional performance factor:

        T_r = T_base / PerformanceFactor_r
        """
        return Decimal(str(base_duration)) / self.performance_factor

    def is_feasible_for(
        self,
        demand: WorkloadDemand,
        current_time: datetime,
        deadline: datetime,
    ) -> bool:
        """Evaluates ONLY finalized hard constraints.

        Invariants:
        1. is_available is True and is_active is True.
        2. available_cpu >= demand.cpu_demand.
        3. available_memory >= demand.memory_demand.
        4. current_time + (base_execution_duration / performance_factor) <= deadline.

        Returns True if all hard constraints are satisfied, False otherwise.
        """
        reason = self.get_infeasibility_reason(demand, current_time, deadline)
        return reason is None

    def get_infeasibility_reason(
        self,
        demand: WorkloadDemand,
        current_time: datetime,
        deadline: datetime,
    ) -> Optional[str]:
        """Returns the specific hard constraint violation reason, or None if feasible."""
        if not self.is_available or not self.is_active:
            return f"Region '{self.code}' is marked unavailable or inactive."

        if self.available_cpu < demand.cpu_demand:
            return (
                f"Insufficient CPU in region '{self.code}': "
                f"available {self.available_cpu} < required {demand.cpu_demand}"
            )

        if self.available_memory < demand.memory_demand:
            return (
                f"Insufficient RAM in region '{self.code}': "
                f"available {self.available_memory} < required {demand.memory_demand}"
            )

        # Normalize timezones for comparison
        if current_time.tzinfo is None and deadline.tzinfo is not None:
            current_time = current_time.replace(tzinfo=timezone.utc)
        elif deadline.tzinfo is None and current_time.tzinfo is not None:
            deadline = deadline.replace(tzinfo=timezone.utc)

        duration_seconds = float(self.estimate_execution_duration(demand.base_execution_duration))
        projected_completion = current_time + timedelta(seconds=duration_seconds)

        if projected_completion > deadline:
            return (
                f"Deadline violation in region '{self.code}': "
                f"projected completion {projected_completion} exceeds deadline {deadline}"
            )

        return None
