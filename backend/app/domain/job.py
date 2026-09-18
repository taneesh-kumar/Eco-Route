"""Job Aggregate Root representing a computational workload across its lifecycle."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from app.domain.exceptions import (
    InvalidJobConfigurationError,
    RetryBudgetExhaustedError,
)
from app.domain.state_machine import JobStateMachine
from app.domain.values import DeadlineSlack, JobPriority, WorkloadDemand
from app.persistence.models.enums import JobStatus, WorkloadType


class Job:
    """Aggregate root for a computational workload.

    Owns requirements, priority, deadlines, and retry budgets.
    Enforces pure domain validations and state transitions without DB dependencies.
    """

    def __init__(
        self,
        workload_name: str,
        workload_type: WorkloadType,
        demand: WorkloadDemand,
        priority: JobPriority,
        deadline: datetime,
        id: Optional[uuid.UUID] = None,
        status: JobStatus = JobStatus.PENDING,
        current_attempt_count: int = 0,
        max_retries: int = 3,
        assigned_region_id: Optional[uuid.UUID] = None,
        created_at: Optional[datetime] = None,
    ) -> None:
        if not workload_name or not workload_name.strip():
            raise InvalidJobConfigurationError("workload_name must not be empty.")

        if isinstance(workload_type, str) and not isinstance(workload_type, WorkloadType):
            workload_type = WorkloadType(workload_type)

        if not isinstance(demand, WorkloadDemand):
            raise InvalidJobConfigurationError("demand must be an instance of WorkloadDemand.")

        if not isinstance(priority, JobPriority):
            raise InvalidJobConfigurationError("priority must be an instance of JobPriority.")

        if not isinstance(deadline, datetime):
            raise InvalidJobConfigurationError("deadline must be a datetime instance.")

        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)

        if max_retries < 0:
            raise InvalidJobConfigurationError(f"max_retries must be non-negative, got {max_retries}")

        if current_attempt_count < 0:
            raise InvalidJobConfigurationError(
                f"current_attempt_count must be non-negative, got {current_attempt_count}"
            )

        self.id: uuid.UUID = id or uuid.uuid4()
        self.workload_name: str = workload_name.strip()
        self.workload_type: WorkloadType = workload_type
        self.demand: WorkloadDemand = demand
        self.priority: JobPriority = priority
        self.deadline: datetime = deadline
        self.status: JobStatus = status
        self.current_attempt_count: int = current_attempt_count
        self.max_retries: int = max_retries
        self.assigned_region_id: Optional[uuid.UUID] = assigned_region_id
        self.created_at: datetime = created_at or datetime.now(timezone.utc)

    def transition_to(self, target_status: JobStatus, reason: str = "") -> None:
        """Transitions Job to target_status after validating against JobStateMachine."""
        if isinstance(target_status, str) and not isinstance(target_status, JobStatus):
            target_status = JobStatus(target_status)

        JobStateMachine.validate_transition(self.status, target_status)
        self.status = target_status

    def calculate_slack(
        self,
        current_time: datetime,
        estimated_duration: Optional[Decimal] = None,
    ) -> DeadlineSlack:
        """Calculates DeadlineSlack using the finalized formula:

        Slack = Deadline - CurrentTime - EstimatedExecutionTime
        """
        est = (
            Decimal(str(estimated_duration))
            if estimated_duration is not None
            else self.demand.base_execution_duration
        )
        return DeadlineSlack(
            deadline=self.deadline,
            current_time=current_time,
            estimated_execution_time=est,
        )

    def can_retry(
        self,
        current_time: datetime,
        estimated_duration: Optional[Decimal] = None,
    ) -> bool:
        """Determines if a failed attempt can be retried.

        Requires:
        1. Remaining retry budget (current_attempt_count < max_retries)
        2. Positive deadline slack for another execution attempt.
        """
        if self.current_attempt_count >= self.max_retries:
            return False

        slack = self.calculate_slack(current_time, estimated_duration)
        return slack.slack_seconds > Decimal("0")

    def record_attempt_dispatched(self) -> int:
        """Increments attempt count on dispatch and verifies retry budget."""
        if self.current_attempt_count >= self.max_retries and self.current_attempt_count > 0:
            raise RetryBudgetExhaustedError(
                f"Job '{self.id}' has exhausted its retry budget ({self.max_retries})."
            )
        self.current_attempt_count += 1
        return self.current_attempt_count
