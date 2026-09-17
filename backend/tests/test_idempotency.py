"""Unit tests for IdempotencyManager dual-layer claim guarantees."""

import uuid
from unittest.mock import AsyncMock, patch
import pytest

from app.execution.idempotency import IdempotencyManager


@pytest.mark.asyncio
async def test_idempotency_acquire_and_release_lock():
    mock_redis = AsyncMock()
    mock_redis.set.return_value = True
    mock_redis.eval.return_value = 1

    mgr = IdempotencyManager(redis_client=mock_redis)
    attempt_id = uuid.uuid4()
    worker_id = "worker-alpha"

    # Acquire lock
    acquired = await mgr.acquire_lock(attempt_id, worker_id, ttl_ms=5000)
    assert acquired is True
    mock_redis.set.assert_awaited_once_with(
        f"ecoroute:lock:attempt:{attempt_id}", worker_id, nx=True, px=5000
    )

    # Release lock
    await mgr.release_lock(attempt_id, worker_id)
    assert mock_redis.eval.await_count == 1


@pytest.mark.asyncio
async def test_idempotency_claim_attempt_successful():
    mock_redis = AsyncMock()
    mock_redis.set.return_value = True

    mock_session = AsyncMock()
    attempt_id = uuid.uuid4()
    worker_id = "worker-alpha"

    mgr = IdempotencyManager(redis_client=mock_redis)

    with patch(
        "app.execution.idempotency.JobAttemptRepository.claim_attempt_atomic",
        new=AsyncMock(return_value=True),
    ):
        claimed = await mgr.claim_attempt(
            attempt_id=attempt_id,
            worker_id=worker_id,
            session=mock_session,
            use_redis_lock=True,
        )
        assert claimed is True
        mock_redis.set.assert_awaited_once()


@pytest.mark.asyncio
async def test_idempotency_claim_attempt_lost_redis_lock():
    mock_redis = AsyncMock()
    mock_redis.set.return_value = False  # Lock already held by another worker

    mock_session = AsyncMock()
    attempt_id = uuid.uuid4()
    worker_id = "worker-beta"

    mgr = IdempotencyManager(redis_client=mock_redis)

    with patch(
        "app.execution.idempotency.JobAttemptRepository.claim_attempt_atomic"
    ) as mock_cas:
        claimed = await mgr.claim_attempt(
            attempt_id=attempt_id,
            worker_id=worker_id,
            session=mock_session,
            use_redis_lock=True,
        )
        assert claimed is False
        mock_cas.assert_not_called()


@pytest.mark.asyncio
async def test_idempotency_claim_attempt_cas_failure_releases_lock():
    mock_redis = AsyncMock()
    mock_redis.set.return_value = True
    mock_redis.eval.return_value = 1

    mock_session = AsyncMock()
    attempt_id = uuid.uuid4()
    worker_id = "worker-gamma"

    mgr = IdempotencyManager(redis_client=mock_redis)

    with patch(
        "app.execution.idempotency.JobAttemptRepository.claim_attempt_atomic",
        new=AsyncMock(return_value=False),  # CAS failed (e.g. status not PENDING)
    ):
        claimed = await mgr.claim_attempt(
            attempt_id=attempt_id,
            worker_id=worker_id,
            session=mock_session,
            use_redis_lock=True,
        )
        assert claimed is False
        # Mutex must be released after CAS failure
        mock_redis.eval.assert_awaited_once()
