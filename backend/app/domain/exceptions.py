"""Domain exceptions for EcoRoute."""


class DomainError(Exception):
    """Base exception for all domain errors."""
    pass


class InvalidStateTransitionError(DomainError):
    """Raised when an invalid state transition is attempted."""
    def __init__(self, entity_type: str, current_state: str, target_state: str, reason: str = ""):
        self.entity_type = entity_type
        self.current_state = current_state
        self.target_state = target_state
        self.reason = reason
        msg = f"Cannot transition {entity_type} from '{current_state}' to '{target_state}'"
        if reason:
            msg += f": {reason}"
        super().__init__(msg)


class InvalidJobConfigurationError(DomainError):
    """Raised when job demand, priority, or deadline parameters violate domain rules."""
    pass


class InvalidAttemptTransitionError(InvalidStateTransitionError):
    """Raised when an invalid attempt transition is attempted."""
    pass


class RegionLockViolationError(DomainError):
    """Raised when attempting to modify the assigned region of a locked attempt."""
    def __init__(self, attempt_id: str, current_region_id: str, attempted_region_id: str, status: str):
        super().__init__(
            f"Attempt '{attempt_id}' is locked to region '{current_region_id}' "
            f"in state '{status}' and cannot be reassigned to '{attempted_region_id}'"
        )
        self.attempt_id = attempt_id
        self.current_region_id = current_region_id
        self.attempted_region_id = attempted_region_id
        self.status = status


class InvalidSchedulingDecisionError(DomainError):
    """Raised when scheduling decision structure, weights, or outcome violate invariants."""
    pass


class UnsafeDeferralError(DomainError):
    """Raised when a deferral is attempted without sufficient deadline slack."""
    pass


class ZeroCarbonFabricationError(DomainError):
    """Raised when missing or unavailable carbon data is paired with synthetic or invalid values."""
    pass


class RetryBudgetExhaustedError(DomainError):
    """Raised when a retry is attempted after exhausting the maximum allowed retries."""
    pass


class SchedulingEngineError(DomainError):
    """Base exception for Scheduling Engine operational errors."""
    pass


class UnschedulableWorkloadError(SchedulingEngineError):
    """Raised when zero feasible regions exist and deadline slack is exhausted."""
    pass
