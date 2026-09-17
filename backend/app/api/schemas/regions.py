"""Pydantic schemas for Cloud Regions and dynamic infrastructure state."""

from decimal import Decimal
from typing import Optional
import uuid
from pydantic import BaseModel, ConfigDict


class RegionResponse(BaseModel):
    """Regional topology and static hardware power specifications."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    provider: str
    country: str
    latitude: Decimal
    longitude: Decimal
    max_cpu_capacity: Decimal
    max_memory_capacity: Decimal
    current_utilization: Decimal
    performance_factor: Decimal
    idle_power_watts: Decimal
    peak_power_watts: Decimal
    network_latency_ms: Decimal
    is_available: bool
    is_active: bool


class RegionStateResponse(BaseModel):
    """Real-time dynamic regional operational state."""
    id: uuid.UUID
    code: str
    current_utilization: Decimal
    carbon_intensity: Optional[Decimal] = None
    carbon_quality: str
    network_latency_ms: Decimal
    is_available: bool
