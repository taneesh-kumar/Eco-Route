"""IdempotencyManager coordinating low-latency Redis mutex and authoritative PostgreSQL CAS claiming."""

from datetime import datetime, timezone
import logging
from typing import Optional
import uuid

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.redis import get_redis_client
from app.persistence.repositories.job_attempt_repository import JobAttemptRepository

logger = logging.getLogger(__name__)


class IdempotencyManager:
    """Provides two-layer concurrency control and idempotent claim guarantees.

    Layer 1: Ephemeral Redis distributed mutex (`lock:attempt:{id}`) for fast
             contention reduction under high worker concurrency.
    Layer 2: Authoritative PostgreSQL Compare-And-Swap (CAS) update on `job_attempts`
             as the sole source of truth.
    """

    LOCK_PREFIX = "ecoroute:lock:attempt:"
    DEFAULT_LOCK_TTL_MS = 5000

    def __init__(self, redis_client: Optional[Redis] = None):
        self._redis = redis_client

    @property
    def redis(self) -> Redis:
        if self._redis is not None:
            return self._redis
        client = get_redis_client()
        if client is None:
            raise RuntimeError("Redis client is not configured or unavailable.")
        return client

    def _lock_key(self, attempt_id: uuid.UUID) -> str:
        return f"{self.LOCK_PREFIX}{attempt_id}"

    async def acquire_lock(
        self,
        attempt_id: uuid.UUID,
        worker_id: str,
        ttl_ms: int = DEFAULT_LOCK_TTL_MS,
    ) -> bool:
        """Attempts to acquire the Redis distributed mutex using SET NX PX."""
        try:
            key = self._lock_key(attempt_id)
            acquired = await self.redis.set(key, worker_id, nx=True, px=ttl_ms)
            return bool(acquired)
        except Exception as exc:
            logger.warning(f"Redis mutex acquire failed for attempt '{attempt_id}': {exc}")
            # Fall back safely to PostgreSQL CAS if Redis is temporarily degraded
            return True

    async def release_lock(
        self,
        attempt_id: uuid.UUID,
        worker_id: str,
    ) -> None:
        """Safely releases the Redis mutex using Lua script ensuring worker ownership."""
        release_script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """
        try:
            key = self._lock_key(attempt_id)
            await self.redis.eval(release_script, 1, key, worker_id)
        except Exception as exc:
            logger.warning(f"Failed to release Redis mutex for attempt '{attempt_id}': {exc}")

    async def claim_attempt(
        self,
        attempt_id: uuid.UUID,
        worker_id: str,
        session: AsyncSession,
        use_redis_lock: bool = True,
    ) -> bool:
        """
        Executes idempotent attempt claim:
        1. Optionally acquires short-lived Redis mutex.
        2. Executes authoritative PostgreSQL CAS update:
           UPDATE job_attempts SET status = 'CLAIMED', claimed_by_worker = ...
           WHERE id = :id AND status = 'PENDING'
        3. Releases Redis mutex if CAS fails.

        Returns True if and only if this worker successfully claimed the attempt.
        """
        if use_redis_lock:
            lock_acquired = await self.acquire_lock(attempt_id, worker_id)
            if not lock_acquired:
                logger.debug(
                    f"Worker '{worker_id}' lost Redis lock race for attempt '{attempt_id}'."
                )
                return False

        repo = JobAttemptRepository(session)
        cas_success = await repo.claim_attempt_atomic(
            attempt_id=attempt_id,
            worker_id=worker_id,
            claimed_at=datetime.now(timezone.utc),
        )

        if not cas_success and use_redis_lock:
            # Release mutex early if CAS did not match PENDING status
            await self.release_lock(attempt_id, worker_id)
            logger.debug(
                f"Worker '{worker_id}' CAS failed for attempt '{attempt_id}' (already claimed/completed)."
            )

        return cas_success
