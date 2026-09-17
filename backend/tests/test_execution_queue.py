"""Unit tests for Redis-backed ExecutionQueue."""

import uuid
from unittest.mock import AsyncMock
import pytest

from app.execution.queue import ExecutionQueue


@pytest.mark.asyncio
async def test_execution_queue_enqueue_and_dequeue():
    mock_redis = AsyncMock()
    queue = ExecutionQueue(redis_client=mock_redis, queue_key="test_queue")

    attempt_id = uuid.uuid4()
    # Test enqueue
    res = await queue.enqueue(attempt_id)
    assert res is True
    mock_redis.lpush.assert_awaited_once_with("test_queue", str(attempt_id))

    # Test blocking dequeue hit
    mock_redis.brpop.return_value = ("test_queue", str(attempt_id))
    popped_id = await queue.dequeue(timeout_seconds=1)
    assert popped_id == attempt_id
    mock_redis.brpop.assert_awaited_once_with("test_queue", timeout=1)

    # Test non-blocking dequeue hit
    mock_redis.rpop.return_value = str(attempt_id)
    non_blocking_id = await queue.dequeue(timeout_seconds=0)
    assert non_blocking_id == attempt_id
    mock_redis.rpop.assert_awaited_once_with("test_queue")


@pytest.mark.asyncio
async def test_execution_queue_empty():
    mock_redis = AsyncMock()
    mock_redis.brpop.return_value = None
    mock_redis.rpop.return_value = None
    queue = ExecutionQueue(redis_client=mock_redis, queue_key="test_queue")

    assert await queue.dequeue(timeout_seconds=1) is None
    assert await queue.dequeue(timeout_seconds=0) is None


@pytest.mark.asyncio
async def test_execution_queue_length_and_clear():
    mock_redis = AsyncMock()
    mock_redis.llen.return_value = 5
    queue = ExecutionQueue(redis_client=mock_redis, queue_key="test_queue")

    length = await queue.length()
    assert length == 5
    mock_redis.llen.assert_awaited_once_with("test_queue")

    await queue.clear()
    mock_redis.delete.assert_awaited_once_with("test_queue")
