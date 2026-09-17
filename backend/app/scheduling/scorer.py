"""Multi-objective Jr score calculator with dynamic weight re-normalization."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict

from app.domain.values import SchedulingWeights
from app.scheduling.normalizer import NormalizedCandidateMetrics


@dataclass(frozen=True)
class CandidateScoreResult:
    """Scoring calculation breakdown and composite Jr score for a candidate region."""
    cost_score_jr: Decimal
    applied_weights: SchedulingWeights
    score_breakdown: Dict[str, Any]


class ScoreCalculator:
    """Calculates composite Jr cost score:

    J_r = w_C * N(C_r) + w_T * N(T_r) + w_U * N(U_r) + w_L * N(L_r)
    """

    @staticmethod
    def renormalize_for_fallback(weights: SchedulingWeights) -> SchedulingWeights:
        """Proportionally re-normalizes non-carbon weights (w_T, w_U, w_L) when carbon is bypassed (w_C = 0)."""
        active_sum = weights.time + weights.utilization + weights.latency
        if active_sum <= Decimal("0"):
            # Fallback evenly across operational metrics
            return SchedulingWeights(
                carbon=Decimal("0.0"),
                time=Decimal("0.50"),
                utilization=Decimal("0.30"),
                latency=Decimal("0.20"),
            )

        new_t = weights.time / active_sum
        new_u = weights.utilization / active_sum
        new_l = weights.latency / active_sum

        # Ensure exact 1.0 sum adjustment for any tiny division residue
        residue = Decimal("1.0") - (new_t + new_u + new_l)
        new_t += residue

        return SchedulingWeights(
            carbon=Decimal("0.0"),
            time=new_t,
            utilization=new_u,
            latency=new_l,
        )

    @classmethod
    def calculate_score(
        cls,
        metrics: NormalizedCandidateMetrics,
        weights: SchedulingWeights,
        carbon_available: bool = True,
    ) -> CandidateScoreResult:
        """Calculates composite Jr score for a candidate region.

        If carbon_available is False or metrics.norm_emissions is None:
        - w_C is set to 0.0
        - Non-carbon weights are proportionally re-normalized.
        """
        if not carbon_available or metrics.norm_emissions is None or weights.carbon == Decimal("0.0"):
            applied_weights = (
                cls.renormalize_for_fallback(weights)
                if weights.carbon > Decimal("0.0")
                else weights
            )
            term_t = applied_weights.time * metrics.norm_duration
            term_u = applied_weights.utilization * metrics.norm_utilization
            term_l = applied_weights.latency * metrics.norm_latency
            jr = term_t + term_u + term_l

            breakdown = {
                "norm_carbon": None,
                "norm_duration": str(metrics.norm_duration),
                "norm_utilization": str(metrics.norm_utilization),
                "norm_latency": str(metrics.norm_latency),
                "weighted_carbon": "0.0",
                "weighted_duration": str(term_t),
                "weighted_utilization": str(term_u),
                "weighted_latency": str(term_l),
                "jr": str(jr),
                "fallback_mode": True,
            }
        else:
            applied_weights = weights
            term_c = applied_weights.carbon * metrics.norm_emissions
            term_t = applied_weights.time * metrics.norm_duration
            term_u = applied_weights.utilization * metrics.norm_utilization
            term_l = applied_weights.latency * metrics.norm_latency
            jr = term_c + term_t + term_u + term_l

            breakdown = {
                "norm_carbon": str(metrics.norm_emissions),
                "norm_duration": str(metrics.norm_duration),
                "norm_utilization": str(metrics.norm_utilization),
                "norm_latency": str(metrics.norm_latency),
                "weighted_carbon": str(term_c),
                "weighted_duration": str(term_t),
                "weighted_utilization": str(term_u),
                "weighted_latency": str(term_l),
                "jr": str(jr),
                "fallback_mode": False,
            }

        return CandidateScoreResult(
            cost_score_jr=jr,
            applied_weights=applied_weights,
            score_breakdown=breakdown,
        )
