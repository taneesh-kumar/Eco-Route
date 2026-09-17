"""Pydantic schemas for truthful sustainability analytics and audit events."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional
import uuid
from pydantic import BaseModel, ConfigDict


class AnalyticsSummaryResponse(BaseModel):
    """Aggregate KPIs computed from persisted workloads."""
    total_jobs: int
    completed_jobs: int
    failed_jobs: int
    waiting_jobs: int
    running_jobs: int = 0
    total_attempts: int = 0
    total_energy_kwh: Decimal
    total_co2eq_grams: Decimal
    avg_job_duration_seconds: Decimal = Decimal("0.0")
    counterfactual_carbon_reduction_pct: Optional[Decimal] = None
    carbon_savings_pct_vs_baseline: Optional[Decimal] = None
    sla_compliance_rate: Decimal
    deferral_rate: Decimal
    failure_rate: Decimal
    retry_rate: Decimal


class AuditEventResponse(BaseModel):
    """Immutable audit trail log record."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: Optional[uuid.UUID] = None
    attempt_id: Optional[uuid.UUID] = None
    event_type: str
    actor: str
    event_metadata: Dict[str, Any]
    event_timestamp: datetime
    created_at: datetime
