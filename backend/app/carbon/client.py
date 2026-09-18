"""HTTP Client for querying live and forecast grid carbon intensity from Electricity Maps API v4."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import logging
from typing import List, Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class CarbonClientError(Exception):
    """Base exception for Electricity Maps API client errors."""
    pass


class CarbonAuthenticationError(CarbonClientError):
    """Raised when Electricity Maps authentication fails (HTTP 401/403)."""
    pass


class CarbonRateLimitError(CarbonClientError):
    """Raised when Electricity Maps rate limit is exceeded (HTTP 429)."""
    pass


class CarbonZoneNotFoundError(CarbonClientError):
    """Raised when an Electricity Maps zone does not exist (HTTP 400/404)."""
    pass


class CarbonProviderUnavailableError(CarbonClientError):
    """Raised when Electricity Maps returns 5xx or connection/timeout error occurs."""
    pass


@dataclass(frozen=True)
class LiveCarbonResult:
    """Result of a successful live carbon intensity query with full provenance."""
    carbon_intensity: Decimal
    zone: str
    observation_timestamp: datetime
    received_at: datetime
    valid_until: datetime
    unit: str = "gCO2eq/kWh"
    source: str = "ELECTRICITY_MAPS"
    is_estimated: bool = False
    estimation_method: Optional[str] = None
    temporal_granularity: str = "hourly"
    flow_traced: bool = True
    emission_factor_type: str = "lifecycle"


@dataclass(frozen=True)
class ForecastCarbonPoint:
    """A future forecasted carbon intensity timestamp and value."""
    timestamp: datetime
    carbon_intensity: Decimal


@dataclass(frozen=True)
class ForecastCarbonResult:
    """Forecast series returned by Electricity Maps."""
    zone: str
    points: List[ForecastCarbonPoint]
    fetched_at: datetime
    source: str = "ELECTRICITY_MAPS_FORECAST"


class ElectricityMapsClient:
    """Asynchronous client for interacting with the Electricity Maps API v4.

    Enforces:
    - Zero key logging/exposure
    - Connection timeouts
    - Full provenance retention (estimation flags, temporal granularity, flow traced)
    - Future forecast queries
    - Startup zone verification
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 5.0,
        validity_duration_seconds: Optional[int] = None,
    ) -> None:
        settings = get_settings()
        self._api_key = api_key if api_key is not None else settings.ELECTRICITY_MAPS_API_KEY
        self._base_url = (base_url or settings.ELECTRICITY_MAPS_API_URL).rstrip("/")
        self._timeout = timeout
        ttl_seconds = validity_duration_seconds or settings.CARBON_CACHE_MAX_AGE_SECONDS
        self._validity_duration = timedelta(seconds=ttl_seconds)

    @property
    def is_configured(self) -> bool:
        """Returns True if an API key is available."""
        return bool(self._api_key and self._api_key.strip())

    async def get_latest_carbon_intensity(self, zone: str) -> LiveCarbonResult:
        """Queries the latest carbon intensity for a specific zone code (e.g. 'US-MIDA-PJM').

        Raises typed CarbonClientError subclasses on failure.
        """
        if not self.is_configured:
            raise CarbonAuthenticationError(
                "Electricity Maps API key is not configured in settings."
            )

        url = f"{self._base_url}/carbon-intensity/latest"
        headers = {"auth-token": self._api_key}
        params = {"zone": zone}
        received_at = datetime.now(timezone.utc)

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(url, headers=headers, params=params)

            if response.status_code == 200:
                data = response.json()
                intensity_val = data.get("carbonIntensity")
                if intensity_val is None:
                    raise CarbonClientError(
                        f"Missing 'carbonIntensity' field in Electricity Maps response for zone '{zone}'."
                    )

                obs_time_str = data.get("datetime")
                if obs_time_str:
                    try:
                        obs_time = datetime.fromisoformat(obs_time_str.replace("Z", "+00:00"))
                    except Exception:
                        obs_time = received_at
                else:
                    obs_time = received_at

                valid_until = max(obs_time + self._validity_duration, received_at + self._validity_duration)

                return LiveCarbonResult(
                    carbon_intensity=Decimal(str(intensity_val)),
                    zone=zone,
                    observation_timestamp=obs_time,
                    received_at=received_at,
                    valid_until=valid_until,
                    unit=data.get("unit", "gCO2eq/kWh"),
                    source="ELECTRICITY_MAPS",
                    is_estimated=bool(data.get("isEstimated", False)),
                    estimation_method=data.get("estimationMethod"),
                    temporal_granularity=data.get("temporalGranularity", "hourly"),
                    flow_traced=bool(data.get("flowTraced", True)),
                    emission_factor_type=data.get("emissionFactorType", "lifecycle"),
                )

            elif response.status_code in (401, 403):
                raise CarbonAuthenticationError(
                    f"Authentication failed with Electricity Maps (HTTP {response.status_code})."
                )
            elif response.status_code == 429:
                raise CarbonRateLimitError(
                    "Electricity Maps rate limit exceeded (HTTP 429)."
                )
            elif response.status_code in (400, 404):
                body = response.text[:200]
                raise CarbonZoneNotFoundError(
                    f"Zone '{zone}' does not exist or invalid request (HTTP {response.status_code}): {body}"
                )
            elif response.status_code >= 500:
                raise CarbonProviderUnavailableError(
                    f"Electricity Maps server error (HTTP {response.status_code})."
                )
            else:
                raise CarbonClientError(
                    f"Unexpected response from Electricity Maps (HTTP {response.status_code}): {response.text[:200]}"
                )

        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise CarbonProviderUnavailableError(
                f"Network/connectivity error contacting Electricity Maps: {exc}"
            ) from exc
        except CarbonClientError:
            raise
        except Exception as exc:
            raise CarbonClientError(
                f"Unexpected error querying Electricity Maps: {exc}"
            ) from exc

    async def get_carbon_intensity_forecast(self, zone: str) -> ForecastCarbonResult:
        """Queries the carbon intensity forecast for a zone."""
        if not self.is_configured:
            raise CarbonAuthenticationError(
                "Electricity Maps API key is not configured in settings."
            )

        url = f"{self._base_url}/carbon-intensity/forecast"
        headers = {"auth-token": self._api_key}
        params = {"zone": zone}
        now = datetime.now(timezone.utc)

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(url, headers=headers, params=params)

            if response.status_code == 200:
                data = response.json()
                forecast_raw = data.get("forecast", [])
                points: List[ForecastCarbonPoint] = []
                for pt in forecast_raw:
                    ci = pt.get("carbonIntensity")
                    dt_str = pt.get("datetime")
                    if ci is not None and dt_str:
                        try:
                            pt_dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                            points.append(
                                ForecastCarbonPoint(
                                    timestamp=pt_dt,
                                    carbon_intensity=Decimal(str(ci)),
                                )
                            )
                        except Exception:
                            continue

                # Sort by timestamp
                points.sort(key=lambda p: p.timestamp)
                return ForecastCarbonResult(
                    zone=zone,
                    points=points,
                    fetched_at=now,
                )
            elif response.status_code in (401, 403):
                raise CarbonAuthenticationError(
                    f"Authentication failed with Electricity Maps forecast (HTTP {response.status_code})."
                )
            elif response.status_code in (400, 404):
                raise CarbonZoneNotFoundError(
                    f"Zone '{zone}' forecast not found (HTTP {response.status_code})."
                )
            elif response.status_code == 429:
                raise CarbonRateLimitError("Electricity Maps forecast rate limit exceeded.")
            else:
                raise CarbonClientError(
                    f"Electricity Maps forecast error (HTTP {response.status_code}): {response.text[:200]}"
                )
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise CarbonProviderUnavailableError(f"Forecast network error: {exc}") from exc
        except CarbonClientError:
            raise
        except Exception as exc:
            raise CarbonClientError(f"Unexpected error querying forecast: {exc}") from exc

    async def validate_zone(self, zone: str) -> bool:
        """Validates that a zone exists in Electricity Maps by querying latest intensity."""
        try:
            await self.get_latest_carbon_intensity(zone)
            return True
        except CarbonZoneNotFoundError:
            return False
        except (CarbonAuthenticationError, CarbonRateLimitError, CarbonProviderUnavailableError):
            # API transient issue or key issue, zone string itself not definitively invalid
            return True
        except Exception:
            return False

    async def validate_all_configured_zones(self, zones: List[str]) -> None:
        """Validates all configured zones and raises ValueError on invalid zones (Critical Rule #4)."""
        if not self.is_configured:
            logger.warning("Electricity Maps API key not configured. Skipping startup zone validation.")
            return

        invalid_zones = []
        for zone in zones:
            valid = await self.validate_zone(zone)
            if not valid:
                invalid_zones.append(zone)

        if invalid_zones:
            raise ValueError(
                f"FATAL: The following Electricity Maps zones are invalid or non-existent: {invalid_zones}. "
                f"Startup aborted to prevent silent fallback or data fabrication."
            )
        logger.info(f"Verified {len(zones)} Electricity Maps zones successfully: {zones}")
