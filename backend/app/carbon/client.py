"""HTTP Client for querying live grid carbon intensity from Electricity Maps API."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import httpx

from app.core.config import get_settings


class CarbonClientError(Exception):
    """Base exception for Electricity Maps API client errors."""
    pass


class CarbonAuthenticationError(CarbonClientError):
    """Raised when Electricity Maps authentication fails (HTTP 401/403)."""
    pass


class CarbonRateLimitError(CarbonClientError):
    """Raised when Electricity Maps rate limit is exceeded (HTTP 429)."""
    pass


class CarbonProviderUnavailableError(CarbonClientError):
    """Raised when Electricity Maps returns 5xx or connection/timeout error occurs."""
    pass


@dataclass(frozen=True)
class LiveCarbonResult:
    """Result of a successful live carbon intensity query."""
    carbon_intensity: Decimal
    zone: str
    observation_timestamp: datetime
    valid_until: datetime
    source: str = "ELECTRICITY_MAPS"


class ElectricityMapsClient:
    """Asynchronous client for interacting with the Electricity Maps API.

    Enforces:
    - Zero key logging/exposure
    - Connection timeouts
    - Graceful error mapping
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 5.0,
        validity_duration_seconds: int = 300,
    ) -> None:
        settings = get_settings()
        self._api_key = api_key if api_key is not None else settings.ELECTRICITY_MAPS_API_KEY
        self._base_url = (base_url or settings.ELECTRICITY_MAPS_API_URL).rstrip("/")
        self._timeout = timeout
        self._validity_duration = timedelta(seconds=validity_duration_seconds)

    @property
    def is_configured(self) -> bool:
        """Returns True if an API key is available."""
        return bool(self._api_key and self._api_key.strip())

    async def get_latest_carbon_intensity(self, zone: str) -> LiveCarbonResult:
        """Queries the latest carbon intensity for a specific zone code (e.g. 'US-CAL-CISO').

        Raises typed CarbonClientError subclasses on failure.
        """
        if not self.is_configured:
            raise CarbonAuthenticationError(
                "Electricity Maps API key is not configured in settings."
            )

        url = f"{self._base_url}/carbon-intensity/latest"
        headers = {"auth-token": self._api_key}
        params = {"zone": zone}

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
                        obs_time = datetime.now(timezone.utc)
                else:
                    obs_time = datetime.now(timezone.utc)

                valid_until = obs_time + self._validity_duration

                return LiveCarbonResult(
                    carbon_intensity=Decimal(str(intensity_val)),
                    zone=zone,
                    observation_timestamp=obs_time,
                    valid_until=valid_until,
                )

            elif response.status_code in (401, 403):
                raise CarbonAuthenticationError(
                    f"Authentication failed with Electricity Maps (HTTP {response.status_code})."
                )
            elif response.status_code == 429:
                raise CarbonRateLimitError(
                    "Electricity Maps rate limit exceeded (HTTP 429)."
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
