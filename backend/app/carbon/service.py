"""Authoritative Carbon Service enforcing the fallback hierarchy and zero-fabrication guarantees."""

from datetime import datetime, timezone
import logging
from typing import Dict, Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.carbon.cache import CarbonCache
from app.carbon.client import CarbonClientError, ElectricityMapsClient
from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.region import Region
from app.persistence.repositories.carbon_observation_repository import (
    CarbonObservationRepository,
)

logger = logging.getLogger(__name__)

# Standard cloud region and EcoRoute seeded codes to Electricity Maps zone mappings
DEFAULT_ZONE_MAPPINGS: Dict[str, str] = {
    # EcoRoute seeded region codes
    "se-sto": "SE-SE3",       # Sweden Central (Stockholm)
    "fr-par": "FR",           # France Central (Paris)
    "de-fra": "DE",           # Germany Central (Frankfurt)
    "us-east": "US-MIDW-PJM",  # US East (N. Virginia / PJM)
    "pl-war": "PL",           # Poland Central (Warsaw)
    "jp-tyo": "JP-TK",        # Asia Pacific (Tokyo)
    "uk-lon": "GB",           # UK South (London / Great Britain)

    # Standard AWS / Cloud region identifiers
    "us-east-1": "US-MIDW-PJM",
    "us-east-2": "US-MIDW-PJM",
    "us-west-1": "US-CAL-CISO",
    "us-west-2": "US-NW-PACW",
    "eu-west-1": "IE",
    "eu-west-2": "GB",
    "eu-west-3": "FR",
    "eu-central-1": "DE",
    "eu-north-1": "SE-SE3",
    "ap-northeast-1": "JP-TK",
    "ap-southeast-1": "SG",
    "ap-south-1": "IN",
}


class CarbonService:
    """Orchestrates carbon signal resolution across Live, Cache, and Fallback tiers.

    Enforces:
    1. Live Electricity Maps query -> DB persist -> Redis cache
    2. Redis Cache check -> if valid, return VALID_CACHE
    3. PostgreSQL check on cache miss -> if valid, re-cache and return VALID_CACHE
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

    def resolve_zone_code(self, region_code: str) -> str:
        """Maps an internal region code (e.g. 'us-east-1') to an Electricity Maps zone."""
        normalized = region_code.strip().lower()
        return self.zone_mappings.get(normalized, normalized.upper())

    async def get_carbon_intensity(
        self,
        region: Region,
        session: Optional[AsyncSession] = None,
    ) -> CarbonIntensity:
        """Resolves carbon intensity for a candidate region following the strict hierarchy:

        Live -> Valid Cache -> Authoritative Fallback -> UNAVAILABLE.
        """
        now = datetime.now(timezone.utc)

        # Tier 1: Check Redis Cache
        try:
            cached = await self.cache.get(region.id)
            if cached is not None and cached.is_fresh and cached.carbon_intensity is not None:
                return CarbonIntensity(
                    quality=CarbonQuality.VALID_CACHE,
                    source=cached.source,
                    value=cached.carbon_intensity,
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
                        # Re-populate Redis
                        await self.cache.set(
                            region_id=region.id,
                            carbon_intensity=db_obs.carbon_intensity,
                            quality=CarbonQuality.VALID_CACHE,
                            source=CarbonSource(db_obs.source),
                            observation_timestamp=db_obs.observation_timestamp,
                            valid_until=db_obs.valid_until,
                        )
                        return CarbonIntensity(
                            quality=CarbonQuality.VALID_CACHE,
                            source=CarbonSource(db_obs.source),
                            value=db_obs.carbon_intensity,
                        )
            except Exception as exc:
                logger.warning("PostgreSQL carbon lookup failed for region %s: %s", region.code, exc)

        # Tier 3: Query Live Electricity Maps API
        zone_code = self.resolve_zone_code(region.code)
        if self.client.is_configured:
            try:
                live_res = await self.client.get_latest_carbon_intensity(zone=zone_code)
                # 3a. Persist to PostgreSQL
                if session is not None:
                    try:
                        repo = CarbonObservationRepository(session)
                        await repo.record_observation(
                            region_id=region.id,
                            source=CarbonSource.ELECTRICITY_MAPS.value,
                            data_quality=CarbonQuality.LIVE.value,
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
                    quality=CarbonQuality.LIVE,
                    source=CarbonSource.ELECTRICITY_MAPS,
                    observation_timestamp=live_res.observation_timestamp,
                    valid_until=live_res.valid_until,
                )

                return CarbonIntensity(
                    quality=CarbonQuality.LIVE,
                    source=CarbonSource.ELECTRICITY_MAPS,
                    value=live_res.carbon_intensity,
                )

            except CarbonClientError as exc:
                logger.warning(
                    "Live carbon fetch failed for region %s (zone %s): %s. Falling back.",
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
            source=CarbonSource.ELECTRICITY_MAPS,
            value=None,
        )
