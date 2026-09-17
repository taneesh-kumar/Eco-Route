"""SchedulingDecision domain entity capturing explainability metrics, scores, and outcomes."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from app.domain.carbon import CarbonQuality, CarbonSource
from app.domain.exceptions import (
    InvalidSchedulingDecisionError,
    ZeroCarbonFabricationError,
)
from app.domain.values import SchedulingWeights
from app.persistence.models.enums import DecisionAction


class SchedulingDecision:
    """Immutable record of an evaluated scheduling decision.

    Captures:
    - Action: EXECUTE, DEFER (or REJECT if unviable/infeasible)
    - Winning target region (mandatory if EXECUTE)
    - Mathematical score breakdown, weights, and candidate rankings
    - Carbon quality and source with strict zero fabrication verification.
    """

    def __init__(
        self,
        job_id: uuid.UUID,
        decision_action: DecisionAction,
        carbon_source_used: CarbonSource,
        carbon_quality_used: CarbonQuality,
        decision_reason: str,
        score_breakdown: Dict[str, Any],
        candidate_rankings: List[Dict[str, Any]],
        applied_weights: SchedulingWeights,
        id: Optional[uuid.UUID] = None,
        attempt_id: Optional[uuid.UUID] = None,
        selected_region_id: Optional[uuid.UUID] = None,
        cost_score_jr: Optional[Decimal] = None,
        estimated_energy_kwh: Optional[Decimal] = None,
        estimated_co2eq_grams: Optional[Decimal] = None,
        normalization_factors: Optional[Dict[str, Any]] = None,
        created_at: Optional[datetime] = None,
    ) -> None:
        if isinstance(decision_action, str) and not isinstance(decision_action, DecisionAction):
            decision_action = DecisionAction(decision_action)

        if isinstance(carbon_quality_used, str) and not isinstance(carbon_quality_used, CarbonQuality):
            carbon_quality_used = CarbonQuality(carbon_quality_used)

        if isinstance(carbon_source_used, str) and not isinstance(carbon_source_used, CarbonSource):
            carbon_source_used = CarbonSource(carbon_source_used)

        # Invariant 1: Action = EXECUTE requires a selected region
        if decision_action == DecisionAction.EXECUTE and selected_region_id is None:
            raise InvalidSchedulingDecisionError(
                "A selected_region_id must be provided when decision_action is 'EXECUTE'."
            )

        # Invariant 2: Zero carbon fabrication
        # If carbon is UNAVAILABLE or CONVENTIONAL_FALLBACK, estimated_co2eq_grams must not be fabricated
        if carbon_quality_used in (CarbonQuality.UNAVAILABLE, CarbonQuality.CONVENTIONAL_FALLBACK):
            if estimated_co2eq_grams is not None:
                raise ZeroCarbonFabricationError(
                    f"estimated_co2eq_grams must be None when carbon quality is '{carbon_quality_used.value}'."
                )

        if not decision_reason or not decision_reason.strip():
            raise InvalidSchedulingDecisionError("decision_reason must not be empty.")

        self.id: uuid.UUID = id or uuid.uuid4()
        self.job_id: uuid.UUID = job_id
        self.attempt_id: Optional[uuid.UUID] = attempt_id
        self.selected_region_id: Optional[uuid.UUID] = selected_region_id
        self.decision_action: DecisionAction = decision_action
        self.cost_score_jr: Optional[Decimal] = (
            Decimal(str(cost_score_jr)) if cost_score_jr is not None else None
        )
        self.estimated_energy_kwh: Optional[Decimal] = (
            Decimal(str(estimated_energy_kwh)) if estimated_energy_kwh is not None else None
        )
        self.estimated_co2eq_grams: Optional[Decimal] = (
            Decimal(str(estimated_co2eq_grams)) if estimated_co2eq_grams is not None else None
        )
        self.carbon_source_used: CarbonSource = carbon_source_used
        self.carbon_quality_used: CarbonQuality = carbon_quality_used
        self.decision_reason: str = decision_reason.strip()
        self.score_breakdown: Dict[str, Any] = score_breakdown
        self.candidate_rankings: List[Dict[str, Any]] = candidate_rankings
        self.applied_weights: SchedulingWeights = applied_weights
        self.normalization_factors: Dict[str, Any] = normalization_factors or {}
        self.created_at: datetime = created_at or datetime.now(timezone.utc)
