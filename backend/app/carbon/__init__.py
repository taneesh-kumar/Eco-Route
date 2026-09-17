"""Carbon integration package for EcoRoute."""

from app.carbon.cache import CachedCarbonObservation, CarbonCache
from app.carbon.client import (
    CarbonAuthenticationError,
    CarbonClientError,
    CarbonProviderUnavailableError,
    CarbonRateLimitError,
    ElectricityMapsClient,
    LiveCarbonResult,
)
from app.carbon.service import CarbonService

__all__ = [
    "ElectricityMapsClient",
    "LiveCarbonResult",
    "CarbonClientError",
    "CarbonAuthenticationError",
    "CarbonRateLimitError",
    "CarbonProviderUnavailableError",
    "CarbonCache",
    "CachedCarbonObservation",
    "CarbonService",
]
