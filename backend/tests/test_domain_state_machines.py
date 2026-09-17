"""Pure unit tests for Job and Attempt State Machines."""

import pytest

from app.domain.exceptions import (
    InvalidAttemptTransitionError,
    InvalidStateTransitionError,
)
from app.domain.state_machine import AttemptStateMachine, JobStateMachine
from app.persistence.models.enums import AttemptStatus, JobStatus


class TestJobStateMachine:
    """Test suite for Job state transitions and invariants."""

    @pytest.mark.parametrize(
        "current, target",
        [
            (JobStatus.PENDING, JobStatus.EVALUATING),
            (JobStatus.EVALUATING, JobStatus.WAITING),
            (JobStatus.EVALUATING, JobStatus.DISPATCHED),
            (JobStatus.EVALUATING, JobStatus.FAILED),
            (JobStatus.WAITING, JobStatus.EVALUATING),
            (JobStatus.WAITING, JobStatus.FAILED),
            (JobStatus.DISPATCHED, JobStatus.RUNNING),
            (JobStatus.RUNNING, JobStatus.COMPLETED),
            (JobStatus.RUNNING, JobStatus.EVALUATING),
            (JobStatus.RUNNING, JobStatus.FAILED),
        ],
    )
    def test_valid_job_transitions(self, current: JobStatus, target: JobStatus):
        assert JobStateMachine.can_transition(current, target) is True
        # Should not raise
        JobStateMachine.validate_transition(current, target)

    @pytest.mark.parametrize(
        "current, target",
        [
            # Disallowed jump from PENDING
            (JobStatus.PENDING, JobStatus.WAITING),
            (JobStatus.PENDING, JobStatus.DISPATCHED),
            (JobStatus.PENDING, JobStatus.RUNNING),
            (JobStatus.PENDING, JobStatus.COMPLETED),
            (JobStatus.PENDING, JobStatus.FAILED),
            # Disallowed jump from EVALUATING
            (JobStatus.EVALUATING, JobStatus.RUNNING),
            (JobStatus.EVALUATING, JobStatus.COMPLETED),
            # Disallowed jump from WAITING
            (JobStatus.WAITING, JobStatus.DISPATCHED),
            (JobStatus.WAITING, JobStatus.RUNNING),
            (JobStatus.WAITING, JobStatus.COMPLETED),
            # Disallowed jump from DISPATCHED
            (JobStatus.DISPATCHED, JobStatus.COMPLETED),
            (JobStatus.DISPATCHED, JobStatus.FAILED),
            (JobStatus.DISPATCHED, JobStatus.WAITING),
            # Out of terminal states
            (JobStatus.COMPLETED, JobStatus.PENDING),
            (JobStatus.COMPLETED, JobStatus.EVALUATING),
            (JobStatus.COMPLETED, JobStatus.RUNNING),
            (JobStatus.FAILED, JobStatus.PENDING),
            (JobStatus.FAILED, JobStatus.EVALUATING),
            (JobStatus.FAILED, JobStatus.RUNNING),
            # Self-transitions
            (JobStatus.PENDING, JobStatus.PENDING),
            (JobStatus.EVALUATING, JobStatus.EVALUATING),
            (JobStatus.WAITING, JobStatus.WAITING),
            (JobStatus.DISPATCHED, JobStatus.DISPATCHED),
            (JobStatus.RUNNING, JobStatus.RUNNING),
            (JobStatus.COMPLETED, JobStatus.COMPLETED),
            (JobStatus.FAILED, JobStatus.FAILED),
        ],
    )
    def test_invalid_job_transitions_raise(self, current: JobStatus, target: JobStatus):
        assert JobStateMachine.can_transition(current, target) is False
        with pytest.raises(InvalidStateTransitionError) as exc_info:
            JobStateMachine.validate_transition(current, target)
        assert exc_info.value.entity_type == "Job"
        assert exc_info.value.current_state == str(current)
        assert exc_info.value.target_state == str(target)

    def test_job_terminal_states(self):
        assert JobStateMachine.is_terminal(JobStatus.COMPLETED) is True
        assert JobStateMachine.is_terminal(JobStatus.FAILED) is True
        assert JobStateMachine.is_terminal(JobStatus.PENDING) is False
        assert JobStateMachine.is_terminal(JobStatus.RUNNING) is False
        assert JobStateMachine.is_terminal(JobStatus.EVALUATING) is False
        assert JobStateMachine.is_terminal(JobStatus.WAITING) is False
        assert JobStateMachine.is_terminal(JobStatus.DISPATCHED) is False


class TestAttemptStateMachine:
    """Test suite for JobAttempt state transitions and invariants."""

    @pytest.mark.parametrize(
        "current, target",
        [
            (AttemptStatus.PENDING, AttemptStatus.CLAIMED),
            (AttemptStatus.CLAIMED, AttemptStatus.RUNNING),
            (AttemptStatus.RUNNING, AttemptStatus.COMPLETED),
            (AttemptStatus.RUNNING, AttemptStatus.FAILED),
        ],
    )
    def test_valid_attempt_transitions(self, current: AttemptStatus, target: AttemptStatus):
        assert AttemptStateMachine.can_transition(current, target) is True
        # Should not raise
        AttemptStateMachine.validate_transition(current, target)

    @pytest.mark.parametrize(
        "current, target",
        [
            # Skipping CLAIMED
            (AttemptStatus.PENDING, AttemptStatus.RUNNING),
            (AttemptStatus.PENDING, AttemptStatus.COMPLETED),
            (AttemptStatus.PENDING, AttemptStatus.FAILED),
            # Skipping RUNNING
            (AttemptStatus.CLAIMED, AttemptStatus.COMPLETED),
            (AttemptStatus.CLAIMED, AttemptStatus.FAILED),
            (AttemptStatus.CLAIMED, AttemptStatus.PENDING),
            # Reversing RUNNING
            (AttemptStatus.RUNNING, AttemptStatus.PENDING),
            (AttemptStatus.RUNNING, AttemptStatus.CLAIMED),
            # Out of terminal states
            (AttemptStatus.COMPLETED, AttemptStatus.PENDING),
            (AttemptStatus.COMPLETED, AttemptStatus.CLAIMED),
            (AttemptStatus.COMPLETED, AttemptStatus.RUNNING),
            (AttemptStatus.COMPLETED, AttemptStatus.FAILED),
            (AttemptStatus.FAILED, AttemptStatus.PENDING),
            (AttemptStatus.FAILED, AttemptStatus.CLAIMED),
            (AttemptStatus.FAILED, AttemptStatus.RUNNING),
            (AttemptStatus.FAILED, AttemptStatus.COMPLETED),
            # Self-transitions
            (AttemptStatus.PENDING, AttemptStatus.PENDING),
            (AttemptStatus.CLAIMED, AttemptStatus.CLAIMED),
            (AttemptStatus.RUNNING, AttemptStatus.RUNNING),
            (AttemptStatus.COMPLETED, AttemptStatus.COMPLETED),
            (AttemptStatus.FAILED, AttemptStatus.FAILED),
        ],
    )
    def test_invalid_attempt_transitions_raise(self, current: AttemptStatus, target: AttemptStatus):
        assert AttemptStateMachine.can_transition(current, target) is False
        with pytest.raises(InvalidAttemptTransitionError) as exc_info:
            AttemptStateMachine.validate_transition(current, target)
        assert exc_info.value.entity_type == "JobAttempt"
        assert exc_info.value.current_state == str(current)
        assert exc_info.value.target_state == str(target)

    def test_attempt_terminal_states(self):
        assert AttemptStateMachine.is_terminal(AttemptStatus.COMPLETED) is True
        assert AttemptStateMachine.is_terminal(AttemptStatus.FAILED) is True
        assert AttemptStateMachine.is_terminal(AttemptStatus.PENDING) is False
        assert AttemptStateMachine.is_terminal(AttemptStatus.CLAIMED) is False
        assert AttemptStateMachine.is_terminal(AttemptStatus.RUNNING) is False
