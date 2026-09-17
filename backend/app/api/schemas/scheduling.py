"""Pydantic schemas for scheduling decisions and explainability."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, computed_field


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

    @computed_field
    @property
    def action(self) -> str:
        return self.decision_action

    @computed_field
    @property
    def rationale(self) -> str:
        return self.decision_reason

    @computed_field
    @property
    def carbon_source(self) -> str:
        return self.carbon_source_used

    @computed_field
    @property
    def carbon_quality(self) -> str:
        return self.carbon_quality_used

    @computed_field
    @property
    def selected_region_code(self) -> Optional[str]:
        return None


class DecisionExplainabilityResponse(DecisionResponse):
    """Full decision explainability breakdown for audit and UI visualizer."""
    score_breakdown: Dict[str, Any] = {}
    candidate_rankings: List[Dict[str, Any]] = []
    applied_weights: Dict[str, Any] = {}
    normalization_factors: Dict[str, Any] = {}

    @computed_field
    @property
    def weights(self) -> Dict[str, float]:
        if self.applied_weights:
            try:
                w_carbon = float(self.applied_weights.get("carbon", 0.6))
                w_cost = float(self.applied_weights.get("cost", self.applied_weights.get("time", 0.3)))
                w_latency = float(self.applied_weights.get("latency", 0.1))
                return {
                    "carbon_weight": w_carbon,
                    "cost_weight": w_cost,
                    "latency_weight": w_latency,
                }
            except Exception:
                pass
        return {"carbon_weight": 0.6, "cost_weight": 0.3, "latency_weight": 0.1}
