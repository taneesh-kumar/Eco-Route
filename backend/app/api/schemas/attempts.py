"""Pydantic schemas for JobAttempt lifecycle inspection and telemetry."""

from datetime import datetime
from decimal import Decimal
from typing import Optional
import uuid
from pydantic import BaseModel, ConfigDict, computed_field


class AttemptResponse(BaseModel):
    """Execution attempt metadata and telemetry."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    attempt_number: int
    region_id: uuid.UUID
    status: str
    claimed_by_worker: Optional[str] = None
    claimed_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    actual_duration: Optional[Decimal] = None
    actual_energy_kwh: Optional[Decimal] = None
    actual_co2eq_grams: Optional[Decimal] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def duration(self) -> Optional[Decimal]:
        return self.actual_duration

    @computed_field
    @property
    def energy_kwh(self) -> Optional[Decimal]:
        return self.actual_energy_kwh

    @computed_field
    @property
    def co2eq_grams(self) -> Optional[Decimal]:
        return self.actual_co2eq_grams

    @computed_field
    @property
    def carbon_intensity_gco2(self) -> Optional[Decimal]:
        if self.actual_energy_kwh and self.actual_co2eq_grams and self.actual_energy_kwh > 0:
            return (self.actual_co2eq_grams / self.actual_energy_kwh).quantize(Decimal("0.01"))
        return None
