"""Pydantic schemas for academic experiment benchmarks."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class ExperimentCreate(BaseModel):
    """Payload to trigger an academic benchmark comparison."""
    name: str = Field(..., min_length=1, max_length=255, description="Experiment title")
    scenario_type: str = Field("DEFAULT_GLOBAL_TOPOLOGY", description="Regional infrastructure scenario")
    workload_count: int = Field(30, ge=5, le=200, description="Synthetic workload population size")
    random_seed: int = Field(42, description="Frozen deterministic PRNG seed")


class ExperimentResponse(BaseModel):
    """Experiment benchmark metadata and status."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    scheduler_variant: str
    random_seed: int
    scenario_type: str
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


class ExperimentResultResponse(BaseModel):
    """Quantitative performance metrics for one scheduler variant within an experiment."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    experiment_id: uuid.UUID
    scheduler_algorithm: str
    total_energy_kwh: Decimal
    total_co2eq_grams: Decimal
    avg_execution_time_seconds: Decimal
    avg_latency_ms: Decimal
    deadline_compliance_rate: Decimal
    failure_rate: Decimal
    retry_rate: Decimal
    duplicate_execution_count: int
    deferral_rate: Decimal
    avg_region_utilization: Decimal
    detailed_metrics: Dict[str, Any]
