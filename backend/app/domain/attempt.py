"""JobAttempt value entity representing an immutable single execution run locked to a target Region."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from app.domain.exceptions import (
    InvalidJobConfigurationError,
    RegionLockViolationError,
)
from app.domain.state_machine import AttemptStateMachine
from app.persistence.models.enums import AttemptStatus


class JobAttempt:
    """Represents a single execution attempt of a Job in a designated Region.

    Enforces:
    - Attempt lifecycle state transitions (PENDING -> CLAIMED -> RUNNING -> COMPLETED / FAILED)
    - Region locking: Once claimed or running, target region cannot be reassigned.
    - Monotonic attempt numbering (attempt_number >= 1).
    """

    def __init__(
        self,
        job_id: uuid.UUID,
        attempt_number: int,
        region_id: uuid.UUID,
        id: Optional[uuid.UUID] = None,
        status: AttemptStatus = AttemptStatus.PENDING,
        claimed_by_worker: Optional[str] = None,
        claimed_at: Optional[datetime] = None,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
        actual_duration: Optional[Decimal] = None,
        actual_energy_kwh: Optional[Decimal] = None,
        actual_co2eq_grams: Optional[Decimal] = None,
        error_message: Optional[str] = None,
    ) -> None:
        if attempt_number < 1:
            raise InvalidJobConfigurationError(
                f"attempt_number must be >= 1, got {attempt_number}"
            )

        if isinstance(status, str) and not isinstance(status, AttemptStatus):
            status = AttemptStatus(status)

        self.id: uuid.UUID = id or uuid.uuid4()
        self.job_id: uuid.UUID = job_id
        self.attempt_number: int = attempt_number
        self.region_id: uuid.UUID = region_id
        self.status: AttemptStatus = status
        self.claimed_by_worker: Optional[str] = claimed_by_worker
        self.claimed_at: Optional[datetime] = claimed_at
        self.started_at: Optional[datetime] = started_at
        self.completed_at: Optional[datetime] = completed_at
        self.actual_duration: Optional[Decimal] = (
            Decimal(str(actual_duration)) if actual_duration is not None else None
        )
        self.actual_energy_kwh: Optional[Decimal] = (
            Decimal(str(actual_energy_kwh)) if actual_energy_kwh is not None else None
        )
        self.actual_co2eq_grams: Optional[Decimal] = (
            Decimal(str(actual_co2eq_grams)) if actual_co2eq_grams is not None else None
        )
        self.error_message: Optional[str] = error_message

    def set_region(self, new_region_id: uuid.UUID) -> None:
        """Assigns a new region to the attempt only if still PENDING.

        Raises RegionLockViolationError if the attempt has already been claimed or started.
        """
        if self.status != AttemptStatus.PENDING and new_region_id != self.region_id:
            raise RegionLockViolationError(
                attempt_id=str(self.id),
                current_region_id=str(self.region_id),
                attempted_region_id=str(new_region_id),
                status=str(self.status),
            )
        self.region_id = new_region_id

    def transition_to(self, target_status: AttemptStatus, reason: str = "") -> None:
        """Transitions attempt to target_status after validating against AttemptStateMachine."""
        if isinstance(target_status, str) and not isinstance(target_status, AttemptStatus):
            target_status = AttemptStatus(target_status)

        AttemptStateMachine.validate_transition(self.status, target_status)
        self.status = target_status

    def claim(self, worker_id: str, claimed_at: Optional[datetime] = None) -> None:
        """Transitions attempt to CLAIMED and binds the worker identifier."""
        if not worker_id or not worker_id.strip():
            raise InvalidJobConfigurationError("Worker identifier must not be empty when claiming attempt.")
        self.transition_to(AttemptStatus.CLAIMED)
        self.claimed_by_worker = worker_id.strip()
        self.claimed_at = claimed_at or datetime.now(timezone.utc)

    def start(self, started_at: Optional[datetime] = None) -> None:
        """Transitions attempt to RUNNING."""
        self.transition_to(AttemptStatus.RUNNING)
        self.started_at = started_at or datetime.now(timezone.utc)

    def complete(
        self,
        actual_duration: Decimal,
        actual_energy_kwh: Decimal,
        actual_co2eq_grams: Optional[Decimal] = None,
        completed_at: Optional[datetime] = None,
    ) -> None:
        """Transitions attempt to COMPLETED and stores actual execution telemetry."""
        dur = Decimal(str(actual_duration))
        energy = Decimal(str(actual_energy_kwh))
        co2 = Decimal(str(actual_co2eq_grams)) if actual_co2eq_grams is not None else None

        if dur <= Decimal("0"):
            raise InvalidJobConfigurationError(f"actual_duration must be > 0, got {dur}")
        if energy < Decimal("0"):
            raise InvalidJobConfigurationError(f"actual_energy_kwh must be >= 0, got {energy}")
        if co2 is not None and co2 < Decimal("0"):
            raise InvalidJobConfigurationError(f"actual_co2eq_grams must be >= 0, got {co2}")

        self.transition_to(AttemptStatus.COMPLETED)
        self.actual_duration = dur
        self.actual_energy_kwh = energy
        self.actual_co2eq_grams = co2
        self.completed_at = completed_at or datetime.now(timezone.utc)

    def fail(
        self,
        error_message: str,
        completed_at: Optional[datetime] = None,
    ) -> None:
        """Transitions attempt to FAILED with the error reason."""
        self.transition_to(AttemptStatus.FAILED)
        self.error_message = error_message
        self.completed_at = completed_at or datetime.now(timezone.utc)
