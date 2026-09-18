"""Authoritative Carbon Service enforcing the fallback hierarchy and zero-fabrication guarantees."""

from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import Dict, List, Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.carbon.cache import CarbonCache
from app.carbon.client import CarbonClientError, ElectricityMapsClient, ForecastCarbonPoint
from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.region import Region
from app.persistence.repositories.carbon_observation_repository import (
    CarbonObservationRepository,
)

logger = logging.getLogger(__name__)

# Fallback legacy alias mappings (Database region.electricity_maps_zone is the primary source of truth)
DEFAULT_ZONE_MAPPINGS: Dict[str, str] = {
    # Legacy alias region codes
    "se-sto": "SE-SE3",       # Sweden Central (Stockholm)
    "fr-par": "FR",           # France Central (Paris)
    "de-fra": "DE",           # Germany Central (Frankfurt)
    "us-east": "US-MIDA-PJM",  # US East (N. Virginia)
    "pl-war": "PL",           # Poland Central (Warsaw)
    "jp-tyo": "JP-TK",        # Asia Pacific (Tokyo)
    "uk-lon": "GB",           # UK South (London)

    # Standard AWS region identifiers
    "us-east-1": "US-MIDA-PJM",
    "us-east-2": "US-MIDW-MISO",
    "us-west-1": "US-CAL-CISO",
    "us-west-2": "US-NW-PACW",
    "ca-central-1": "CA-QC",
    "ca-west-1": "CA-AB",
    "sa-east-1": "BR-CS",
    "eu-north-1": "SE-SE3",
    "eu-west-1": "IE",
    "eu-west-2": "GB",
    "eu-west-3": "FR",
    "eu-central-1": "DE",
    "eu-central-2": "CH",
    "eu-south-1": "IT-NO",
    "eu-south-2": "ES",
    "af-south-1": "ZA",
    "me-central-1": "AE",
    "ap-northeast-1": "JP-TK",
    "ap-northeast-2": "KR",
    "ap-northeast-3": "JP-KN",
    "ap-southeast-1": "SG",
    "ap-southeast-2": "AUS-NSW",
    "ap-southeast-4": "AUS-VIC",
    "ap-south-1": "IN-WE",
    "ap-south-2": "IN-SO",
}


class CarbonService:
    """Orchestrates carbon signal resolution across Live, Cache, and Fallback tiers.

    Strict Hierarchy:
    1. Live Electricity Maps query -> DB persist -> Redis cache
    2. Redis Cache check -> if valid, return CACHE_VALID
    3. PostgreSQL check on cache miss -> if valid, re-cache and return CACHE_VALID
    4. Unavailable tier -> returns UNAVAILABLE with intensity None (ZERO FABRICATION)
    """

    def __init__(
        self,
        client: Optional[ElectricityMapsClient] = None,
        cache: Optional[CarbonCache] = None,
        zone_mappings: Optional[Dict[str, str]] = None,
    ) -> None:
        self.client = client or ElectricityMapsClient()
        self.cache = cache or CarbonCache()
        self.zone_mappings = zone_mappings or DEFAULT_ZONE_MAPPINGS

    def resolve_zone_code(self, region: Region) -> str:
        """Maps an internal region code or explicit zone attribute to an Electricity Maps zone."""
        explicit_zone = getattr(region, "electricity_maps_zone", None)
        if explicit_zone and explicit_zone.strip():
            return explicit_zone.strip()

        normalized = region.code.strip().lower()
        return self.zone_mappings.get(normalized, normalized.upper())

    async def get_carbon_intensity(
        self,
        region: Region,
        session: Optional[AsyncSession] = None,
    ) -> CarbonIntensity:
        """Resolves carbon intensity for a candidate region following the strict hierarchy:

        Live -> Valid Cache -> UNAVAILABLE.
        """
        now = datetime.now(timezone.utc)
        zone_code = self.resolve_zone_code(region)

        # Tier 1: Check Redis Cache for fresh observation
        try:
            cached = await self.cache.get(region.id)
            if cached is not None and cached.is_fresh and cached.carbon_intensity is not None:
                return CarbonIntensity(
                    quality=CarbonQuality.CACHE_VALID,
                    source=CarbonSource.CACHE,
                    value=cached.carbon_intensity,
                    unit=cached.unit,
                    zone=zone_code,
                    observed_at=cached.observation_timestamp,
                    received_at=cached.observation_timestamp,
                    is_estimated=cached.is_estimated,
                    estimation_method=cached.estimation_method,
                    temporal_granularity=cached.temporal_granularity,
                    flow_traced=cached.flow_traced,
                    emission_factor_type=cached.emission_factor_type,
                    cache_age_seconds=cached.cache_age_seconds,
                )
        except Exception as exc:
            logger.warning("Redis lookup failed for region %s: %s", region.code, exc)

        # Tier 2: Check PostgreSQL Durable Store on Cache Miss
        if session is not None:
            try:
                repo = CarbonObservationRepository(session)
                db_obs = await repo.get_latest_for_region(region.id)
                if db_obs is not None:
                    db_valid_until = (
                        db_obs.valid_until
                        if db_obs.valid_until.tzinfo is not None
                        else db_obs.valid_until.replace(tzinfo=timezone.utc)
                    )
                    if now < db_valid_until and db_obs.carbon_intensity is not None:
                        obs_time = (
                            db_obs.observation_timestamp
                            if db_obs.observation_timestamp.tzinfo is not None
                            else db_obs.observation_timestamp.replace(tzinfo=timezone.utc)
                        )
                        cache_age = max(0, int((now - obs_time).total_seconds()))

                        # Re-populate Redis
                        await self.cache.set(
                            region_id=region.id,
                            carbon_intensity=db_obs.carbon_intensity,
                            quality=CarbonQuality.CACHE_VALID,
                            source=CarbonSource.CACHE,
                            observation_timestamp=obs_time,
                            valid_until=db_valid_until,
                            zone=zone_code,
                        )
                        return CarbonIntensity(
                            quality=CarbonQuality.CACHE_VALID,
                            source=CarbonSource.CACHE,
                            value=db_obs.carbon_intensity,
                            zone=zone_code,
                            observed_at=obs_time,
                            cache_age_seconds=cache_age,
                        )
            except Exception as exc:
                logger.warning("PostgreSQL carbon lookup failed for region %s: %s", region.code, exc)

        # Tier 3: Query Live Electricity Maps API
        if self.client.is_configured:
            try:
                live_res = await self.client.get_latest_carbon_intensity(zone=zone_code)
                quality = (
                    CarbonQuality.LIVE_ESTIMATED
                    if live_res.is_estimated
                    else CarbonQuality.LIVE_TRUSTED
                )

                # 3a. Persist to PostgreSQL
                if session is not None:
                    try:
                        repo = CarbonObservationRepository(session)
                        await repo.record_observation(
                            region_id=region.id,
                            source=CarbonSource.ELECTRICITY_MAPS.value,
                            data_quality=quality.value,
                            observation_timestamp=live_res.observation_timestamp,
                            valid_until=live_res.valid_until,
                            carbon_intensity=live_res.carbon_intensity,
                        )
                    except Exception as exc:
                        logger.error("Failed to persist live carbon observation to DB: %s", exc)

                # 3b. Cache in Redis
                await self.cache.set(
                    region_id=region.id,
                    carbon_intensity=live_res.carbon_intensity,
                    quality=CarbonQuality.CACHE_VALID,
                    source=CarbonSource.CACHE,
                    observation_timestamp=live_res.observation_timestamp,
                    valid_until=live_res.valid_until,
                    unit=live_res.unit,
                    zone=live_res.zone,
                    is_estimated=live_res.is_estimated,
                    estimation_method=live_res.estimation_method,
                    temporal_granularity=live_res.temporal_granularity,
                    flow_traced=live_res.flow_traced,
                    emission_factor_type=live_res.emission_factor_type,
                )

                return CarbonIntensity(
                    quality=quality,
                    source=CarbonSource.LIVE,
                    value=live_res.carbon_intensity,
                    unit=live_res.unit,
                    zone=live_res.zone,
                    observed_at=live_res.observation_timestamp,
                    received_at=live_res.received_at,
                    is_estimated=live_res.is_estimated,
                    estimation_method=live_res.estimation_method,
                    temporal_granularity=live_res.temporal_granularity,
                    flow_traced=live_res.flow_traced,
                    emission_factor_type=live_res.emission_factor_type,
                    cache_age_seconds=0,
                )

            except CarbonClientError as exc:
                logger.warning(
                    "Live carbon fetch failed for region %s (zone %s): %s. Falling back to UNAVAILABLE.",
                    region.code,
                    zone_code,
                    exc,
                )
            except Exception as exc:
                logger.error("Unexpected error fetching live carbon for %s: %s", region.code, exc)

        # Tier 4: UNAVAILABLE (Zero-Fabrication Fallback)
        # Carbon intensity and emissions are None.
        return CarbonIntensity(
            quality=CarbonQuality.UNAVAILABLE,
            source=CarbonSource.UNAVAILABLE,
            value=None,
            zone=zone_code,
        )

    async def get_forecast(self, region: Region) -> Optional[List[ForecastCarbonPoint]]:
        """Queries future carbon intensity forecast for a region."""
        zone_code = self.resolve_zone_code(region)

        # 1. Check Redis cache
        try:
            cached_pts = await self.cache.get_forecast(zone_code)
            if cached_pts:
                return [
                    ForecastCarbonPoint(timestamp=p.timestamp, carbon_intensity=p.carbon_intensity)
                    for p in cached_pts
                ]
        except Exception as exc:
            logger.warning("Redis lookup failed for forecast zone %s: %s", zone_code, exc)

        # 2. Query live client
        if self.client.is_configured:
            try:
                res = await self.client.get_carbon_intensity_forecast(zone=zone_code)
                if res and res.points:
                    from app.carbon.cache import CachedForecastPoint
                    cached_data = [
                        CachedForecastPoint(timestamp=p.timestamp, carbon_intensity=p.carbon_intensity)
                        for p in res.points
                    ]
                    await self.cache.set_forecast(zone_code, cached_data)
                    return res.points
            except Exception as exc:
                logger.warning("Failed to fetch forecast for zone %s: %s", zone_code, exc)

        return None
