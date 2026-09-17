"""Carbon intensity and data quality domain models.

Enforces zero carbon fabrication:
- UNAVAILABLE or CONVENTIONAL_FALLBACK never becomes zero, average, guessed, or fabricated carbon.
- LIVE and VALID_CACHE must have explicit non-negative carbon intensity values.
"""

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Optional

from app.domain.exceptions import ZeroCarbonFabricationError


class CarbonQuality(StrEnum):
    """Quality levels for carbon intensity signals."""
    LIVE = "LIVE"
    VALID_CACHE = "VALID_CACHE"
    CONVENTIONAL_FALLBACK = "CONVENTIONAL_FALLBACK"
    UNAVAILABLE = "UNAVAILABLE"


class CarbonSource(StrEnum):
    """Source provider for carbon observations."""
    ELECTRICITY_MAPS = "ELECTRICITY_MAPS"
    REGIONAL_PROFILE = "REGIONAL_PROFILE"


@dataclass(frozen=True)
class CarbonIntensity:
    """Carbon intensity measurement with strict zero-fabrication invariant.

    Invariants:
    - If quality is UNAVAILABLE or CONVENTIONAL_FALLBACK, value must be None.
    - If quality is LIVE or VALID_CACHE, value must be a non-negative Decimal.
    - UNAVAILABLE never becomes 0.0, an average, or a fabricated number.
    """
    quality: CarbonQuality
    source: CarbonSource
    value: Optional[Decimal] = None

    def __post_init__(self) -> None:
        # Convert string enum if necessary
        if isinstance(self.quality, str) and not isinstance(self.quality, CarbonQuality):
            object.__setattr__(self, "quality", CarbonQuality(self.quality))
        if isinstance(self.source, str) and not isinstance(self.source, CarbonSource):
            object.__setattr__(self, "source", CarbonSource(self.source))

        if self.quality in (CarbonQuality.UNAVAILABLE, CarbonQuality.CONVENTIONAL_FALLBACK):
            if self.value is not None:
                raise ZeroCarbonFabricationError(
                    f"Carbon intensity must be None when quality is '{self.quality.value}'. "
                    f"Fabricating or guessing values ({self.value}) is strictly prohibited."
                )
        elif self.quality in (CarbonQuality.LIVE, CarbonQuality.VALID_CACHE):
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
        return self.quality in (CarbonQuality.LIVE, CarbonQuality.VALID_CACHE) and self.value is not None
