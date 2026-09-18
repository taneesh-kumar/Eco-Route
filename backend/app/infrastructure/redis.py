from typing import Optional, Tuple
import redis.asyncio as aioredis
from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.logging import logger

_redis_client: Optional[Redis] = None


def get_redis_client() -> Optional[Redis]:
    global _redis_client
    settings = get_settings()

    if not settings.REDIS_URL:
        return None

    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
        )

    return _redis_client


async def check_redis_connectivity() -> Tuple[bool, str]:
    """
    Non-destructive connectivity check against Redis.
    Returns (is_connected, status_message).
    """
    settings = get_settings()
    if not settings.REDIS_URL:
        return False, "Redis URL is not configured"

    client = get_redis_client()
    if client is None:
        return False, "Redis client could not be initialized"

    try:
        pong = await client.ping()
        if pong:
            return True, "connected"
        return False, "Redis did not respond to PING"
    except Exception as exc:
        logger.error(f"Redis connectivity check failed: {exc}")
        return False, f"Connection failed: {str(exc)}"


async def close_redis_connections() -> None:
    global _redis_client
    if _redis_client is not None:
        logger.info("Closing Redis connections...")
        try:
            await _redis_client.aclose()
        except Exception as exc:
            logger.debug(f"Redis connection close exception (ignored during shutdown): {exc}")
        finally:
            _redis_client = None
