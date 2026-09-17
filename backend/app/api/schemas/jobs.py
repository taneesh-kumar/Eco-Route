"""Pydantic schemas for workload intake and job inspection."""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.persistence.models.enums import SchedulerVariant, WorkloadType


class WorkloadCreate(BaseModel):
    """Payload for submitting a computational workload to EcoRoute."""
    workload_name: str = Field(..., min_length=1, max_length=255, description="Unique human-readable identifier")
    workload_type: WorkloadType = Field(..., description="Workload profile: BATCH, INFERENCE, TRAINING")
    cpu_demand: Decimal = Field(..., gt=0, description="CPU cores required")
    memory_demand: Decimal = Field(..., gt=0, description="RAM in GB required")
    base_execution_duration: Decimal = Field(..., gt=0, description="Base duration in seconds")
    priority: int = Field(5, ge=1, le=10, description="Workload priority from 1 (lowest) to 10 (highest)")
    deadline: datetime = Field(..., description="Hard SLA deadline timestamp (ISO 8601)")
    scheduler_variant: SchedulerVariant = Field(
        default=SchedulerVariant.ECOROUTE,
        description="Scheduling strategy variant to evaluate",
    )


class JobResponse(BaseModel):
    """Representation of a persisted workload."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workload_name: str
    workload_type: str
    cpu_demand: Decimal
    memory_demand: Decimal
    base_execution_duration: Decimal
    priority: int
    deadline: datetime
    status: str
    current_attempt_count: int
    max_retries: int
    created_at: datetime
    updated_at: datetime


class JobSubmissionResponse(BaseModel):
    """Response returned upon successful workload submission."""
    job: JobResponse
    decision_id: Optional[uuid.UUID] = None
    decision_action: str
    selected_region_id: Optional[uuid.UUID] = None
    dispatched_attempt_id: Optional[uuid.UUID] = None
