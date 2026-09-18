"""Redis cache layer for carbon intensity observations and forecasts."""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import json
import logging
from typing import List, Optional
import uuid

from app.core.config import get_settings
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
    unit: str = "gCO2eq/kWh"
    zone: str = ""
    is_estimated: bool = False
    estimation_method: Optional[str] = None
    temporal_granularity: str = "hourly"
    flow_traced: bool = True
    emission_factor_type: str = "lifecycle"

    @property
    def is_fresh(self) -> bool:
        """True if the cached observation is still within its validity window."""
        now = datetime.now(timezone.utc)
        valid_until = self.valid_until
        if valid_until.tzinfo is None:
            valid_until = valid_until.replace(tzinfo=timezone.utc)
        return now < valid_until

    @property
    def cache_age_seconds(self) -> int:
        """Elapsed seconds since the observation was recorded."""
        now = datetime.now(timezone.utc)
        obs_time = self.observation_timestamp
        if obs_time.tzinfo is None:
            obs_time = obs_time.replace(tzinfo=timezone.utc)
        return max(0, int((now - obs_time).total_seconds()))


@dataclass(frozen=True)
class CachedForecastPoint:
    """A cached forecast point."""
    timestamp: datetime
    carbon_intensity: Decimal


class CarbonCache:
    """Redis-backed cache for short-lived carbon observations and forecasts."""

    KEY_PREFIX = "carbon:observation:"
    FORECAST_KEY_PREFIX = "carbon:forecast:"

    def __init__(self, default_ttl_seconds: Optional[int] = None) -> None:
        settings = get_settings()
        self.default_ttl = default_ttl_seconds or settings.CARBON_CACHE_MAX_AGE_SECONDS
        self.forecast_ttl = settings.CARBON_FORECAST_CACHE_MAX_AGE_SECONDS

    def _get_key(self, region_id: uuid.UUID) -> str:
        return f"{self.KEY_PREFIX}{region_id}"

    def _get_forecast_key(self, zone: str) -> str:
        return f"{self.FORECAST_KEY_PREFIX}{zone.strip().upper()}"

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

            quality_val = payload.get("quality", CarbonQuality.CACHE_VALID.value)
            # Map legacy enum strings
            if quality_val == "VALID_CACHE":
                quality_val = CarbonQuality.CACHE_VALID.value
            elif quality_val == "LIVE":
                quality_val = CarbonQuality.CACHE_VALID.value

            cached = CachedCarbonObservation(
                region_id=region_id,
                carbon_intensity=(
                    Decimal(str(payload["carbon_intensity"]))
                    if payload.get("carbon_intensity") is not None
                    else None
                ),
                quality=CarbonQuality(quality_val),
                source=CarbonSource.CACHE,
                observation_timestamp=obs_time,
                valid_until=valid_until,
                unit=payload.get("unit", "gCO2eq/kWh"),
                zone=payload.get("zone", ""),
                is_estimated=bool(payload.get("is_estimated", False)),
                estimation_method=payload.get("estimation_method"),
                temporal_granularity=payload.get("temporal_granularity", "hourly"),
                flow_traced=bool(payload.get("flow_traced", True)),
                emission_factor_type=payload.get("emission_factor_type", "lifecycle"),
            )

            if not cached.is_fresh:
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
        unit: str = "gCO2eq/kWh",
        zone: str = "",
        is_estimated: bool = False,
        estimation_method: Optional[str] = None,
        temporal_granularity: str = "hourly",
        flow_traced: bool = True,
        emission_factor_type: str = "lifecycle",
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
            "unit": unit,
            "zone": zone,
            "is_estimated": is_estimated,
            "estimation_method": estimation_method,
            "temporal_granularity": temporal_granularity,
            "flow_traced": flow_traced,
            "emission_factor_type": emission_factor_type,
        }

        try:
            await client.set(key, json.dumps(payload), ex=ttl)
            return True
        except Exception as exc:
            logger.warning("Redis error writing carbon cache for region %s: %s", region_id, exc)
            return False

    async def get_forecast(self, zone: str) -> Optional[List[CachedForecastPoint]]:
        """Retrieves cached forecast points for a zone."""
        client = await get_redis_client()
        if client is None:
            return None

        key = self._get_forecast_key(zone)
        try:
            raw = await client.get(key)
            if not raw:
                return None
            data = json.loads(raw)
            points = [
                CachedForecastPoint(
                    timestamp=datetime.fromisoformat(pt["timestamp"]),
                    carbon_intensity=Decimal(str(pt["carbon_intensity"])),
                )
                for pt in data
            ]
            return points
        except Exception as exc:
            logger.warning("Redis error reading forecast cache for zone %s: %s", zone, exc)
            return None

    async def set_forecast(self, zone: str, points: List[CachedForecastPoint]) -> bool:
        """Stores forecast points in Redis."""
        client = await get_redis_client()
        if client is None:
            return False

        key = self._get_forecast_key(zone)
        payload = [
            {
                "timestamp": pt.timestamp.isoformat(),
                "carbon_intensity": str(pt.carbon_intensity),
            }
            for pt in points
        ]
        try:
            await client.set(key, json.dumps(payload), ex=self.forecast_ttl)
            return True
        except Exception as exc:
            logger.warning("Redis error writing forecast cache for zone %s: %s", zone, exc)
            return False
