"""Redis-backed execution queue transporting only attempt IDs, with local-development memory fallback."""

import asyncio
import logging
import uuid
from typing import Optional

from redis.asyncio import Redis

from app.infrastructure.redis import get_redis_client

logger = logging.getLogger(__name__)

EXECUTION_QUEUE_KEY = "ecoroute:execution_queue"


class ExecutionQueue:
    """Queue abstraction operating strictly on Attempt IDs.

    Durable workload and attempt state is stored exclusively in PostgreSQL.
    Redis acts as the preferred ephemeral transport mechanism.
    An internal asyncio.Queue acts solely as a local-development transport fallback
    when Redis is unavailable or unconfigured.
    """

    def __init__(
        self,
        redis_client: Optional[Redis] = None,
        queue_key: str = EXECUTION_QUEUE_KEY,
        use_memory_fallback_on_error: bool = True,
    ):
        self._redis = redis_client
        self.queue_key = queue_key
        self.use_memory_fallback_on_error = use_memory_fallback_on_error
        self._memory_fallback: asyncio.Queue[uuid.UUID] = asyncio.Queue()

    @property
    def redis(self) -> Redis:
        if self._redis is not None:
            return self._redis
        client = get_redis_client()
        if client is None:
            raise RuntimeError("Redis client is not configured or unavailable.")
        return client

    async def enqueue(self, attempt_id: uuid.UUID) -> bool:
        """Pushes an attempt ID to the head of the execution queue (LPUSH).

        Falls back to local memory queue if Redis is unreachable.
        """
        val = str(attempt_id)
        try:
            await self.redis.lpush(self.queue_key, val)
            logger.debug(f"Enqueued attempt '{val}' to Redis '{self.queue_key}'.")
            return True
        except Exception as exc:
            logger.warning(
                f"Failed to enqueue attempt '{attempt_id}' to Redis: {exc}. "
                f"Falling back to local in-memory transport."
            )
            if self.use_memory_fallback_on_error:
                await self._memory_fallback.put(attempt_id)
                return True
            return False

    async def dequeue(self, timeout_seconds: int = 1) -> Optional[uuid.UUID]:
        """Pops an attempt ID from the tail of the execution queue.

        Uses Redis BRPOP/RPOP if available; falls back to local in-memory queue.
        """
        # 1. Try Redis first
        try:
            if timeout_seconds > 0:
                result = await self.redis.brpop(self.queue_key, timeout=timeout_seconds)
                if result:
                    raw_val = result[1]
                    return uuid.UUID(raw_val)
            else:
                raw_val = await self.redis.rpop(self.queue_key)
                if raw_val:
                    return uuid.UUID(raw_val)
        except Exception as exc:
            logger.debug(f"Redis dequeue check failed/bypassed: {exc}")

        # 2. Check in-memory fallback queue if Redis yielded None or failed
        if self.use_memory_fallback_on_error and not self._memory_fallback.empty():
            try:
                return self._memory_fallback.get_nowait()
            except asyncio.QueueEmpty:
                pass

        return None

    async def length(self) -> int:
        """Returns the current number of pending attempt IDs in Redis + memory queue."""
        redis_len = 0
        try:
            redis_len = await self.redis.llen(self.queue_key)
        except Exception:
            pass
        return redis_len + self._memory_fallback.qsize()

    async def clear(self) -> None:
        """Flushes both Redis and memory fallback queues (used primarily in testing)."""
        try:
            await self.redis.delete(self.queue_key)
        except Exception:
            pass
        while not self._memory_fallback.empty():
            try:
                self._memory_fallback.get_nowait()
            except asyncio.QueueEmpty:
                break

