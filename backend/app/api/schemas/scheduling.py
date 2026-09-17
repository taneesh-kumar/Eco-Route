"""Pydantic schemas for scheduling decisions and explainability."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict


class DecisionResponse(BaseModel):
    """Core scheduling decision record."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    attempt_id: Optional[uuid.UUID] = None
    selected_region_id: Optional[uuid.UUID] = None
    decision_action: str
    cost_score_jr: Optional[Decimal] = None
    estimated_energy_kwh: Optional[Decimal] = None
    estimated_co2eq_grams: Optional[Decimal] = None
    carbon_source_used: str
    carbon_quality_used: str
    decision_reason: str
    created_at: datetime


class DecisionExplainabilityResponse(DecisionResponse):
    """Full decision explainability breakdown for audit and UI visualizer."""
    score_breakdown: Dict[str, Any]
    candidate_rankings: List[Dict[str, Any]]
    applied_weights: Dict[str, Any]
    normalization_factors: Dict[str, Any]
