"""State machines for Job and JobAttempt lifecycles.

Enforces authoritative transition rules defined in data architecture:
- Job Lifecycle:
    PENDING -> EVALUATING
    EVALUATING -> WAITING | DISPATCHED | FAILED
    WAITING -> EVALUATING | FAILED
    DISPATCHED -> RUNNING
    RUNNING -> COMPLETED | EVALUATING | FAILED
    COMPLETED / FAILED are terminal.

- Attempt Lifecycle:
    PENDING -> CLAIMED
    CLAIMED -> RUNNING
    RUNNING -> COMPLETED | FAILED
    COMPLETED / FAILED are terminal.
"""

from typing import Dict, FrozenSet, Set
from app.domain.exceptions import (
    InvalidAttemptTransitionError,
    InvalidStateTransitionError,
)
from app.persistence.models.enums import AttemptStatus, JobStatus


class JobStateMachine:
    """Validator for Job lifecycle state transitions."""

    VALID_TRANSITIONS: Dict[JobStatus, FrozenSet[JobStatus]] = {
        JobStatus.PENDING: frozenset({JobStatus.EVALUATING}),
        JobStatus.EVALUATING: frozenset({
            JobStatus.WAITING,
            JobStatus.DISPATCHED,
            JobStatus.FAILED,
        }),
        JobStatus.WAITING: frozenset({
            JobStatus.EVALUATING,
            JobStatus.FAILED,
        }),
        JobStatus.DISPATCHED: frozenset({JobStatus.RUNNING}),
        JobStatus.RUNNING: frozenset({
            JobStatus.COMPLETED,
            JobStatus.EVALUATING,
            JobStatus.FAILED,
        }),
        JobStatus.COMPLETED: frozenset(),
        JobStatus.FAILED: frozenset(),
    }

    TERMINAL_STATES: FrozenSet[JobStatus] = frozenset({
        JobStatus.COMPLETED,
        JobStatus.FAILED,
    })

    @classmethod
    def can_transition(cls, current: JobStatus, target: JobStatus) -> bool:
        """Check if transition from current to target is allowed."""
        return target in cls.VALID_TRANSITIONS.get(current, frozenset())

    @classmethod
    def validate_transition(cls, current: JobStatus, target: JobStatus) -> None:
        """Validate state transition, raising InvalidStateTransitionError if illegal."""
        if current == target:
            raise InvalidStateTransitionError(
                entity_type="Job",
                current_state=str(current),
                target_state=str(target),
                reason="Cannot transition to the identical state",
            )
        if not cls.can_transition(current, target):
            valid_destinations = [
                s.value for s in cls.VALID_TRANSITIONS.get(current, frozenset())
            ]
            valid_dest_str = ", ".join(valid_destinations) if valid_destinations else "None (Terminal State)"
            raise InvalidStateTransitionError(
                entity_type="Job",
                current_state=str(current),
                target_state=str(target),
                reason=f"Allowed destination states: [{valid_dest_str}]",
            )

    @classmethod
    def is_terminal(cls, status: JobStatus) -> bool:
        """Check if job status is terminal (COMPLETED or FAILED)."""
        return status in cls.TERMINAL_STATES


class AttemptStateMachine:
    """Validator for JobAttempt lifecycle state transitions."""

    VALID_TRANSITIONS: Dict[AttemptStatus, FrozenSet[AttemptStatus]] = {
        AttemptStatus.PENDING: frozenset({AttemptStatus.CLAIMED}),
        AttemptStatus.CLAIMED: frozenset({AttemptStatus.RUNNING}),
        AttemptStatus.RUNNING: frozenset({
            AttemptStatus.COMPLETED,
            AttemptStatus.FAILED,
        }),
        AttemptStatus.COMPLETED: frozenset(),
        AttemptStatus.FAILED: frozenset(),
    }

    TERMINAL_STATES: FrozenSet[AttemptStatus] = frozenset({
        AttemptStatus.COMPLETED,
        AttemptStatus.FAILED,
    })

    @classmethod
    def can_transition(cls, current: AttemptStatus, target: AttemptStatus) -> bool:
        """Check if transition from current to target is allowed."""
        return target in cls.VALID_TRANSITIONS.get(current, frozenset())

    @classmethod
    def validate_transition(cls, current: AttemptStatus, target: AttemptStatus) -> None:
        """Validate attempt transition, raising InvalidAttemptTransitionError if illegal."""
        if current == target:
            raise InvalidAttemptTransitionError(
                entity_type="JobAttempt",
                current_state=str(current),
                target_state=str(target),
                reason="Cannot transition to the identical state",
            )
        if not cls.can_transition(current, target):
            valid_destinations = [
                s.value for s in cls.VALID_TRANSITIONS.get(current, frozenset())
            ]
            valid_dest_str = ", ".join(valid_destinations) if valid_destinations else "None (Terminal State)"
            raise InvalidAttemptTransitionError(
                entity_type="JobAttempt",
                current_state=str(current),
                target_state=str(target),
                reason=f"Allowed destination states: [{valid_dest_str}]",
            )

    @classmethod
    def is_terminal(cls, status: AttemptStatus) -> bool:
        """Check if attempt status is terminal (COMPLETED or FAILED)."""
        return status in cls.TERMINAL_STATES
