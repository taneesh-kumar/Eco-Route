"""Carbon intensity and data quality domain models.

Enforces zero carbon fabrication:
- UNAVAILABLE or CONVENTIONAL_FALLBACK never becomes zero, average, guessed, or fabricated carbon.
- LIVE and VALID_CACHE must have explicit non-negative carbon intensity values.
- Provenance and metadata are preserved on every observation.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Optional

from app.domain.exceptions import ZeroCarbonFabricationError


class CarbonQuality(StrEnum):
    """Quality levels for carbon intensity signals."""
    LIVE = "LIVE"
    LIVE_TRUSTED = "LIVE_TRUSTED"
    LIVE_ESTIMATED = "LIVE_ESTIMATED"
    VALID_CACHE = "VALID_CACHE"
    CACHE_VALID = "CACHE_VALID"
    CACHE_STALE = "CACHE_STALE"
    CONVENTIONAL_FALLBACK = "CONVENTIONAL_FALLBACK"
    UNAVAILABLE = "UNAVAILABLE"


class CarbonSource(StrEnum):
    """Source provider for carbon observations."""
    LIVE = "LIVE"
    CACHE = "CACHE"
    FORECAST = "FORECAST"
    ELECTRICITY_MAPS = "ELECTRICITY_MAPS"
    REGIONAL_PROFILE = "REGIONAL_PROFILE"
    UNAVAILABLE = "UNAVAILABLE"


@dataclass(frozen=True)
class CarbonIntensity:
    """Carbon intensity measurement with strict zero-fabrication invariant.

    Invariants:
    - If quality is UNAVAILABLE, CACHE_STALE, or CONVENTIONAL_FALLBACK, value must be None.
    - If quality is LIVE, LIVE_TRUSTED, LIVE_ESTIMATED, VALID_CACHE, or CACHE_VALID, value must be a non-negative Decimal.
    - UNAVAILABLE never becomes 0.0, an average, or a fabricated number.
    """
    quality: CarbonQuality
    source: CarbonSource
    value: Optional[Decimal] = None
    unit: str = "gCO2eq/kWh"
    zone: str = ""
    observed_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    is_estimated: bool = False
    estimation_method: Optional[str] = None
    temporal_granularity: str = "hourly"
    flow_traced: bool = True
    emission_factor_type: str = "lifecycle"
    cache_age_seconds: Optional[int] = None

    def __post_init__(self) -> None:
        if isinstance(self.quality, str) and not isinstance(self.quality, CarbonQuality):
            object.__setattr__(self, "quality", CarbonQuality(self.quality))
        if isinstance(self.source, str) and not isinstance(self.source, CarbonSource):
            object.__setattr__(self, "source", CarbonSource(self.source))

        untrustworthy_qualities = (
            CarbonQuality.UNAVAILABLE,
            CarbonQuality.CONVENTIONAL_FALLBACK,
            CarbonQuality.CACHE_STALE,
        )
        trustworthy_qualities = (
            CarbonQuality.LIVE,
            CarbonQuality.LIVE_TRUSTED,
            CarbonQuality.LIVE_ESTIMATED,
            CarbonQuality.VALID_CACHE,
            CarbonQuality.CACHE_VALID,
        )

        if self.quality in untrustworthy_qualities:
            if self.value is not None:
                raise ZeroCarbonFabricationError(
                    f"Carbon intensity must be None when quality is '{self.quality.value}'. "
                    f"Fabricating or guessing values ({self.value}) is strictly prohibited."
                )
        elif self.quality in trustworthy_qualities:
            if self.value is None:
                raise ZeroCarbonFabricationError(
                    f"Carbon intensity cannot be None when quality is '{self.quality.value}'."
                )
            dec_val = Decimal(str(self.value))
            if dec_val < Decimal("0"):
                raise ZeroCarbonFabricationError(
                    f"Carbon intensity cannot be negative, got {dec_val}."
                )
            object.__setattr__(self, "value", dec_val)

    @property
    def is_trustworthy(self) -> bool:
        """True if the measurement is verified live or fresh valid cache with a valid intensity."""
        trustworthy_qualities = (
            CarbonQuality.LIVE,
            CarbonQuality.LIVE_TRUSTED,
            CarbonQuality.LIVE_ESTIMATED,
            CarbonQuality.VALID_CACHE,
            CarbonQuality.CACHE_VALID,
        )
        return self.quality in trustworthy_qualities and self.value is not None
