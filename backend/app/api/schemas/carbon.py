"""Pydantic schemas for grid carbon observations."""

from datetime import datetime
from decimal import Decimal
from typing import Optional
import uuid
from pydantic import BaseModel, ConfigDict


class CarbonObservationResponse(BaseModel):
    """Grid carbon observation details with data provenance."""
    model_config = ConfigDict(from_attributes=True)

    region_id: uuid.UUID
    region_code: str
    carbon_intensity: Optional[Decimal] = None
    data_quality: str
    source: str
    is_trustworthy: bool
    observation_timestamp: datetime
