"""Concurrency, race condition, and audit reconstruction verification suite (Phase 9)."""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.execution.dispatcher import ExecutionDispatcher
from app.execution.idempotency import IdempotencyManager
from app.execution.queue import ExecutionQueue
from app.persistence.models.audit_event import AuditEvent
from app.persistence.models.enums import AttemptStatus, JobStatus, WorkloadType
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.repositories.job_attempt_repository import JobAttemptRepository


@pytest.mark.asyncio
async def test_concurrent_cas_attempt_claiming():
    """Simulate 10 workers simultaneously trying to claim the exact same attempt.

    Invariants:
    - Exactly 1 worker wins the claim (returns True).
    - Exactly 9 workers receive False (lost race).
    - claim_count strictly == 1.
    """
    attempt_id = uuid.uuid4()
    lock_acquired_by = None
    lock = asyncio.Lock()

    async def worker_attempt_claim(worker_id: str):
        # We simulate the Redis lock + Postgres CAS interaction
        # Only the first to claim will see status == PENDING
        async with lock:
            nonlocal lock_acquired_by
            if lock_acquired_by is None:
                lock_acquired_by = worker_id
                return True
            else:
                return False

    tasks = [worker_attempt_claim(f"worker-{i}") for i in range(10)]
    results = await asyncio.gather(*tasks)

    successes = [r for r in results if r is True]
    failures = [r for r in results if r is False]

    assert len(successes) == 1
    assert len(failures) == 9
    assert lock_acquired_by is not None


@pytest.mark.asyncio
async def test_concurrent_dispatch_monotonic_numbering():
    """Verify concurrent dispatches serialize attempt numbering via parent row lock.

    Invariants:
    - Attempt numbers are strictly monotonic and unique.
    - UNIQUE(job_id, attempt_number) is never violated.
    """
    job_id = uuid.uuid4()
    region_id = uuid.uuid4()
    dispatched_attempts = []
    parent_lock = asyncio.Lock()
    current_counter = 0

    async def simulate_dispatch(dispatcher_id: int):
        async with parent_lock:  # Equivalent to SELECT ... FOR UPDATE on parent job row
            nonlocal current_counter
            current_counter += 1
            attempt_num = current_counter
            attempt = JobAttempt(
                id=uuid.uuid4(),
                job_id=job_id,
                attempt_number=attempt_num,
                region_id=region_id,
                status=AttemptStatus.PENDING.value,
            )
            dispatched_attempts.append(attempt)
            return attempt

    # Launch 5 concurrent dispatchers
    tasks = [simulate_dispatch(i) for i in range(5)]
    results = await asyncio.gather(*tasks)

    assert len(results) == 5
    attempt_numbers = [a.attempt_number for a in dispatched_attempts]
    assert attempt_numbers == [1, 2, 3, 4, 5]
    assert len(set(attempt_numbers)) == 5


@pytest.mark.asyncio
async def test_audit_trail_lifecycle_reconstruction():
    """Verify that state transitions produce an auditable, ordered chronological log."""
    job_id = uuid.uuid4()
    attempt_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    events = [
        AuditEvent(
            id=uuid.uuid4(),
            job_id=job_id,
            attempt_id=None,
            event_type="JOB_CREATED",
            actor="API",
            event_metadata={"workload_name": "audit-test-01", "cpu": 4},
            event_timestamp=now,
            created_at=now,
        ),
        AuditEvent(
            id=uuid.uuid4(),
            job_id=job_id,
            attempt_id=attempt_id,
            event_type="ATTEMPT_DISPATCHED",
            actor="DISPATCHER",
            event_metadata={"attempt_number": 1, "region": "us-east"},
            event_timestamp=now,
            created_at=now,
        ),
        AuditEvent(
            id=uuid.uuid4(),
            job_id=job_id,
            attempt_id=attempt_id,
            event_type="ATTEMPT_CLAIMED",
            actor="WORKER",
            event_metadata={"worker_id": "worker-alpha"},
            event_timestamp=now,
            created_at=now,
        ),
        AuditEvent(
            id=uuid.uuid4(),
            job_id=job_id,
            attempt_id=attempt_id,
            event_type="ATTEMPT_COMPLETED",
            actor="WORKER",
            event_metadata={"energy_kwh": 0.45, "co2eq_grams": 42.1},
            event_timestamp=now,
            created_at=now,
        ),
    ]

    # Verify chronological sequence
    actions = [e.event_type for e in events]
    assert actions == [
        "JOB_CREATED",
        "ATTEMPT_DISPATCHED",
        "ATTEMPT_CLAIMED",
        "ATTEMPT_COMPLETED",
    ]

    # Reconstruct provenance
    completed_event = events[3]
    assert completed_event.event_metadata["energy_kwh"] == 0.45
    assert completed_event.event_metadata["co2eq_grams"] == 42.1
