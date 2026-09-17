"""Redis-backed execution queue transporting only attempt IDs."""

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
    Redis acts solely as the ephemeral transport mechanism.
    """

    def __init__(self, redis_client: Optional[Redis] = None, queue_key: str = EXECUTION_QUEUE_KEY):
        self._redis = redis_client
        self.queue_key = queue_key

    @property
    def redis(self) -> Redis:
        if self._redis is not None:
            return self._redis
        client = get_redis_client()
        if client is None:
            raise RuntimeError("Redis client is not configured or unavailable.")
        return client

    async def enqueue(self, attempt_id: uuid.UUID) -> bool:
        """Pushes an attempt ID to the head of the execution queue (LPUSH)."""
        try:
            val = str(attempt_id)
            await self.redis.lpush(self.queue_key, val)
            logger.debug(f"Enqueued attempt '{val}' to '{self.queue_key}'.")
            return True
        except Exception as exc:
            logger.error(f"Failed to enqueue attempt '{attempt_id}': {exc}")
            return False

    async def dequeue(self, timeout_seconds: int = 1) -> Optional[uuid.UUID]:
        """Pops an attempt ID from the tail of the execution queue.

        Uses BRPOP with timeout if timeout_seconds > 0, otherwise non-blocking RPOP.
        """
        try:
            if timeout_seconds > 0:
                result = await self.redis.brpop(self.queue_key, timeout=timeout_seconds)
                if result:
                    # result is tuple (queue_key, value)
                    raw_val = result[1]
                    return uuid.UUID(raw_val)
                return None
            else:
                raw_val = await self.redis.rpop(self.queue_key)
                if raw_val:
                    return uuid.UUID(raw_val)
                return None
        except Exception as exc:
            logger.error(f"Failed to dequeue from '{self.queue_key}': {exc}")
            return None

    async def length(self) -> int:
        """Returns the current number of pending attempt IDs in the queue."""
        try:
            return await self.redis.llen(self.queue_key)
        except Exception as exc:
            logger.error(f"Failed to inspect queue length: {exc}")
            return 0

    async def clear(self) -> None:
        """Flushes the execution queue (used primarily in test teardown)."""
        try:
            await self.redis.delete(self.queue_key)
        except Exception as exc:
            logger.warning(f"Failed to clear queue '{self.queue_key}': {exc}")
