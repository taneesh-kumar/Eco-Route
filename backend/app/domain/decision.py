"""SchedulingDecision domain entity capturing explainability metrics, scores, and outcomes."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid

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
    - Action: EXECUTE, DEFER, or REJECT
    - Decision Mode: CARBON_AWARE, CONVENTIONAL_FALLBACK, or DEFERRED
    - Winning target region (mandatory if EXECUTE)
    - Mathematical score breakdown, weights, and candidate rankings
    - Carbon quality, source, and explicit zero fabrication verification
    - Baseline counterfactual conventional evaluation and estimated savings
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
        decision_mode: str = "CARBON_AWARE",
        carbon_optimization_applied: bool = True,
        fallback_reason: Optional[str] = None,
        baseline_strategy: Optional[str] = None,
        baseline_region_id: Optional[uuid.UUID] = None,
        baseline_energy_kwh: Optional[Decimal] = None,
        baseline_co2eq_grams: Optional[Decimal] = None,
        estimated_savings_co2eq_grams: Optional[Decimal] = None,
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
        untrustworthy_qualities = (
            CarbonQuality.UNAVAILABLE,
            CarbonQuality.CONVENTIONAL_FALLBACK,
            CarbonQuality.CACHE_STALE,
        )
        if carbon_quality_used in untrustworthy_qualities:
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
        self.decision_mode: str = decision_mode
        self.carbon_optimization_applied: bool = carbon_optimization_applied
        self.fallback_reason: Optional[str] = fallback_reason
        self.baseline_strategy: Optional[str] = baseline_strategy
        self.baseline_region_id: Optional[uuid.UUID] = baseline_region_id
        self.baseline_energy_kwh: Optional[Decimal] = (
            Decimal(str(baseline_energy_kwh)) if baseline_energy_kwh is not None else None
        )
        self.baseline_co2eq_grams: Optional[Decimal] = (
            Decimal(str(baseline_co2eq_grams)) if baseline_co2eq_grams is not None else None
        )
        self.estimated_savings_co2eq_grams: Optional[Decimal] = (
            Decimal(str(estimated_savings_co2eq_grams)) if estimated_savings_co2eq_grams is not None else None
        )
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
