"""EcoRoute Domain Layer.

Contains pure domain models, aggregates, value objects, state machines, and exceptions.
Zero dependency on SQLAlchemy, FastAPI, or external I/O.
"""

from app.domain.attempt import JobAttempt
from app.domain.carbon import (
    CarbonIntensity,
    CarbonQuality,
    CarbonSource,
)
from app.domain.decision import SchedulingDecision
from app.domain.exceptions import (
    DomainError,
    InvalidAttemptTransitionError,
    InvalidJobConfigurationError,
    InvalidSchedulingDecisionError,
    InvalidStateTransitionError,
    RegionLockViolationError,
    RetryBudgetExhaustedError,
    UnsafeDeferralError,
    ZeroCarbonFabricationError,
)
from app.domain.job import Job
from app.domain.region import Region
from app.domain.state_machine import AttemptStateMachine, JobStateMachine
from app.domain.values import (
    DeadlineSlack,
    JobPriority,
    SchedulingWeights,
    WorkloadDemand,
)

__all__ = [
    # Exceptions
    "DomainError",
    "InvalidStateTransitionError",
    "InvalidJobConfigurationError",
    "InvalidAttemptTransitionError",
    "RegionLockViolationError",
    "InvalidSchedulingDecisionError",
    "UnsafeDeferralError",
    "ZeroCarbonFabricationError",
    "RetryBudgetExhaustedError",
    # Value Objects
    "WorkloadDemand",
    "JobPriority",
    "SchedulingWeights",
    "DeadlineSlack",
    # Carbon
    "CarbonQuality",
    "CarbonSource",
    "CarbonIntensity",
    # State Machines
    "JobStateMachine",
    "AttemptStateMachine",
    # Entities / Aggregates
    "Job",
    "JobAttempt",
    "Region",
    "SchedulingDecision",
]
