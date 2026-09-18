"""Pydantic schemas for workload intake and job inspection."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field, model_validator

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
    max_retries: int = Field(3, ge=1, le=10, description="Total attempt budget")

    carbon_weight: Optional[Decimal] = Field(None, ge=0, le=1)
    time_weight: Optional[Decimal] = Field(None, ge=0, le=1)
    utilization_weight: Optional[Decimal] = Field(None, ge=0, le=1)
    latency_weight: Optional[Decimal] = Field(None, ge=0, le=1)

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # cpu_cores -> cpu_demand
            if "cpu_cores" in data and "cpu_demand" not in data:
                data["cpu_demand"] = data["cpu_cores"]
            # memory_gb -> memory_demand
            if "memory_gb" in data and "memory_demand" not in data:
                data["memory_demand"] = data["memory_gb"]
            # estimated_duration_seconds -> base_execution_duration
            if "estimated_duration_seconds" in data and "base_execution_duration" not in data:
                data["base_execution_duration"] = data["estimated_duration_seconds"]
            # deadline_offset_seconds -> deadline
            if "deadline_offset_seconds" in data and "deadline" not in data:
                offset = float(data["deadline_offset_seconds"])
                now = datetime.now(timezone.utc)
                data["deadline"] = now + timedelta(seconds=offset)
            # cost_weight -> time_weight fallback
            if "cost_weight" in data and "time_weight" not in data:
                data["time_weight"] = data["cost_weight"]
        return data


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
    priority_class: str = "MEDIUM"
    deadline: datetime
    status: str
    current_attempt_count: int
    max_retries: int
    assigned_region_id: Optional[uuid.UUID] = None
    assigned_region_code: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def sanitize_attributes(cls, data: Any) -> Any:
        pri_val = None
        if isinstance(data, dict):
            pri_val = data.get("priority")
            assigned_reg = data.get("assigned_region")
            if assigned_reg and hasattr(assigned_reg, "code"):
                data["assigned_region_code"] = assigned_reg.code
            elif isinstance(assigned_reg, dict) and "code" in assigned_reg:
                data["assigned_region_code"] = assigned_reg["code"]
        else:
            if hasattr(data, "priority"):
                pri_val = getattr(data, "priority")
            if hasattr(data, "assigned_region") and getattr(data, "assigned_region"):
                setattr(data, "assigned_region_code", getattr(data, "assigned_region").code)

        if pri_val is not None:
            try:
                p_int = int(pri_val)
                p_class = "HIGH" if 1 <= p_int <= 3 else ("MEDIUM" if 4 <= p_int <= 7 else "LOW")
                if isinstance(data, dict):
                    data["priority_class"] = p_class
                else:
                    setattr(data, "priority_class", p_class)
            except Exception:
                pass
        return data


class JobSubmissionResponse(BaseModel):
    """Response returned upon successful workload submission."""
    job: JobResponse
    decision_id: Optional[uuid.UUID] = None
    decision_action: str
    selected_region_id: Optional[uuid.UUID] = None
    dispatched_attempt_id: Optional[uuid.UUID] = None
