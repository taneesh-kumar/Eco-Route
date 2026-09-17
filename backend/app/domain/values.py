"""Domain Value Objects for EcoRoute.

These value objects enforce immutability, numerical boundary checks, and domain invariants
without external framework or persistence dependencies.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Union

from app.domain.exceptions import (
    InvalidJobConfigurationError,
    InvalidSchedulingDecisionError,
)


@dataclass(frozen=True)
class WorkloadDemand:
    """Workload resource requirements and baseline duration.

    Invariants:
    - cpu_demand > 0
    - memory_demand > 0
    - base_execution_duration > 0
    """
    cpu_demand: Decimal
    memory_demand: Decimal
    base_execution_duration: Decimal

    def __post_init__(self) -> None:
        cpu = Decimal(str(self.cpu_demand))
        mem = Decimal(str(self.memory_demand))
        dur = Decimal(str(self.base_execution_duration))

        if cpu <= Decimal("0"):
            raise InvalidJobConfigurationError(
                f"cpu_demand must be > 0, got {cpu}"
            )
        if mem <= Decimal("0"):
            raise InvalidJobConfigurationError(
                f"memory_demand must be > 0, got {mem}"
            )
        if dur <= Decimal("0"):
            raise InvalidJobConfigurationError(
                f"base_execution_duration must be > 0, got {dur}"
            )

        # Set frozen normalized Decimal attributes
        object.__setattr__(self, "cpu_demand", cpu)
        object.__setattr__(self, "memory_demand", mem)
        object.__setattr__(self, "base_execution_duration", dur)


@dataclass(frozen=True)
class JobPriority:
    """Priority level for workloads (1 to 10).

    Invariants:
    - 1 <= value <= 10
    """
    value: int

    def __post_init__(self) -> None:
        if not isinstance(self.value, int):
            try:
                val = int(self.value)
            except (ValueError, TypeError):
                raise InvalidJobConfigurationError(
                    f"Job priority must be an integer between 1 and 10, got {self.value}"
                )
            object.__setattr__(self, "value", val)

        if not (1 <= self.value <= 10):
            raise InvalidJobConfigurationError(
                f"Job priority must be between 1 and 10 inclusive, got {self.value}"
            )


@dataclass(frozen=True)
class SchedulingWeights:
    """Multi-objective optimization weights for composite score (Jr).

    Invariants:
    - w_C, w_T, w_U, w_L >= 0
    - w_C + w_T + w_U + w_L == 1.0 (within Decimal precision tolerance)
    Note: Phase 4 policy strategies (e.g. fallback calculation) must NOT be implemented here.
    """
    carbon: Decimal
    time: Decimal
    utilization: Decimal
    latency: Decimal

    def __post_init__(self) -> None:
        c = Decimal(str(self.carbon))
        t = Decimal(str(self.time))
        u = Decimal(str(self.utilization))
        l = Decimal(str(self.latency))

        for name, val in [("carbon", c), ("time", t), ("utilization", u), ("latency", l)]:
            if val < Decimal("0"):
                raise InvalidSchedulingDecisionError(
                    f"Weight '{name}' must be non-negative, got {val}"
                )

        total = c + t + u + l
        # Allow tiny epsilon for floating point conversion tolerance, e.g. 1e-4
        if abs(total - Decimal("1.0")) > Decimal("0.0001"):
            raise InvalidSchedulingDecisionError(
                f"Scheduling weights must sum to 1.0, got {total}"
            )

        object.__setattr__(self, "carbon", c)
        object.__setattr__(self, "time", t)
        object.__setattr__(self, "utilization", u)
        object.__setattr__(self, "latency", l)


@dataclass(frozen=True)
class DeadlineSlack:
    """Deadline slack computation and deferral safety evaluator.

    Finalized Formula:
    Slack = Deadline - CurrentTime - EstimatedExecutionTime
    (No latency added unless already incorporated into EstimatedExecutionTime).
    """
    deadline: datetime
    current_time: datetime
    estimated_execution_time: Decimal

    def __post_init__(self) -> None:
        # Validate timezones match or normalize
        dl = self.deadline
        ct = self.current_time

        if dl.tzinfo is None and ct.tzinfo is not None:
            dl = dl.replace(tzinfo=timezone.utc)
            object.__setattr__(self, "deadline", dl)
        elif dl.tzinfo is not None and ct.tzinfo is None:
            ct = ct.replace(tzinfo=timezone.utc)
            object.__setattr__(self, "current_time", ct)

        dur = Decimal(str(self.estimated_execution_time))
        if dur < Decimal("0"):
            raise InvalidJobConfigurationError(
                f"estimated_execution_time must be non-negative, got {dur}"
            )
        object.__setattr__(self, "estimated_execution_time", dur)

    @property
    def slack_seconds(self) -> Decimal:
        """Calculates deadline slack in seconds: Deadline - CurrentTime - EstimatedExecutionTime."""
        total_delta_seconds = Decimal(str((self.deadline - self.current_time).total_seconds()))
        return total_delta_seconds - self.estimated_execution_time

    @property
    def is_exhausted(self) -> bool:
        """True if slack is zero or negative (immediate execution or failure required)."""
        return self.slack_seconds <= Decimal("0")

    def is_safe_for_deferral(self, min_window_seconds: Union[Decimal, float, int] = 0) -> bool:
        """True if slack strictly exceeds zero and meets or exceeds the required deferral window."""
        window = Decimal(str(min_window_seconds))
        return self.slack_seconds > Decimal("0") and self.slack_seconds >= window
