"""Redis cache layer for carbon intensity observations."""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import json
import logging
from typing import Optional
import uuid

from app.domain.carbon import CarbonQuality, CarbonSource
from app.infrastructure.redis import get_redis_client

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CachedCarbonObservation:
    """Deserialized carbon observation retrieved from Redis cache."""
    region_id: uuid.UUID
    carbon_intensity: Optional[Decimal]
    quality: CarbonQuality
    source: CarbonSource
    observation_timestamp: datetime
    valid_until: datetime

    @property
    def is_fresh(self) -> bool:
        """True if the cached observation is still within its validity window."""
        now = datetime.now(timezone.utc)
        valid_until = self.valid_until
        if valid_until.tzinfo is None:
            valid_until = valid_until.replace(tzinfo=timezone.utc)
        return now < valid_until


class CarbonCache:
    """Redis-backed cache for short-lived carbon observations."""

    KEY_PREFIX = "carbon:observation:"

    def __init__(self, default_ttl_seconds: int = 300) -> None:
        self.default_ttl = default_ttl_seconds

    def _get_key(self, region_id: uuid.UUID) -> str:
        return f"{self.KEY_PREFIX}{region_id}"

    async def get(self, region_id: uuid.UUID) -> Optional[CachedCarbonObservation]:
        """Retrieves a cached observation. Returns None if miss, expired, or Redis unavailable."""
        client = await get_redis_client()
        if client is None:
            return None

        key = self._get_key(region_id)
        try:
            raw_data = await client.get(key)
            if not raw_data:
                return None

            payload = json.loads(raw_data)
            obs_time = datetime.fromisoformat(payload["observation_timestamp"])
            valid_until = datetime.fromisoformat(payload["valid_until"])

            cached = CachedCarbonObservation(
                region_id=region_id,
                carbon_intensity=(
                    Decimal(str(payload["carbon_intensity"]))
                    if payload.get("carbon_intensity") is not None
                    else None
                ),
                quality=CarbonQuality(payload.get("quality", CarbonQuality.VALID_CACHE.value)),
                source=CarbonSource(payload.get("source", CarbonSource.ELECTRICITY_MAPS.value)),
                observation_timestamp=obs_time,
                valid_until=valid_until,
            )

            if not cached.is_fresh:
                # Expired entry
                return None

            return cached

        except Exception as exc:
            logger.warning("Redis error reading carbon cache for region %s: %s", region_id, exc)
            return None

    async def set(
        self,
        region_id: uuid.UUID,
        carbon_intensity: Optional[Decimal],
        quality: CarbonQuality,
        source: CarbonSource,
        observation_timestamp: datetime,
        valid_until: datetime,
    ) -> bool:
        """Writes observation to Redis with TTL. Returns True if successful."""
        client = await get_redis_client()
        if client is None:
            return False

        key = self._get_key(region_id)
        now = datetime.now(timezone.utc)
        vu = valid_until if valid_until.tzinfo is not None else valid_until.replace(tzinfo=timezone.utc)
        ttl = max(1, int((vu - now).total_seconds())) if vu > now else self.default_ttl

        payload = {
            "region_id": str(region_id),
            "carbon_intensity": str(carbon_intensity) if carbon_intensity is not None else None,
            "quality": quality.value,
            "source": source.value,
            "observation_timestamp": observation_timestamp.isoformat(),
            "valid_until": valid_until.isoformat(),
        }

        try:
            await client.set(key, json.dumps(payload), ex=ttl)
            return True
        except Exception as exc:
            logger.warning("Redis error writing carbon cache for region %s: %s", region_id, exc)
            return False
