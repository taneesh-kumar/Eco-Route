"""Deferral evaluation and execution timing determination."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from app.domain.values import DeadlineSlack
from app.persistence.models.enums import DecisionAction


@dataclass(frozen=True)
class DeferralEvaluationResult:
    """Outcome of execution timing evaluation (EXECUTE vs DEFER)."""
    action: DecisionAction
    reason: str
    slack_seconds: Decimal
    verified_forecast_jr: Optional[Decimal]


class DeferralEvaluator:
    """Evaluates whether to dispatch immediately (EXECUTE) or hold in WAITING (DEFER).

    Strict Finalized Rules:
    - Slack = Deadline - CurrentTime - EstimatedDuration
    - Slack <= 0 -> Immediate EXECUTE (hard deadline invariant)
    - Slack > 0 -> DEFER permitted ONLY if a verified future forecast indicates
      J_future < J_current - epsilon
    - If no verified future forecast exists -> DEFER cannot be established -> EXECUTE
    - If zero feasible regions exist and Slack > 0 -> DEFER (await capacity deallocation)
    """

    @classmethod
    def evaluate_with_candidates(
        cls,
        slack: DeadlineSlack,
        current_best_jr: Decimal,
        verified_forecast_jr: Optional[Decimal] = None,
        epsilon: Decimal = Decimal("0.0"),
    ) -> DeferralEvaluationResult:
        """Determines action when feasible candidate regions exist."""
        if slack.is_exhausted:
            return DeferralEvaluationResult(
                action=DecisionAction.EXECUTE,
                reason="Deadline slack exhausted (Slack <= 0); immediate execution required.",
                slack_seconds=slack.slack_seconds,
                verified_forecast_jr=verified_forecast_jr,
            )

        if verified_forecast_jr is None:
            return DeferralEvaluationResult(
                action=DecisionAction.EXECUTE,
                reason="No verified future carbon forecast available; dispatching best candidate immediately.",
                slack_seconds=slack.slack_seconds,
                verified_forecast_jr=None,
            )

        # Deferral condition: J_future < J_current - epsilon
        opportunity_threshold = current_best_jr - epsilon
        if verified_forecast_jr < opportunity_threshold:
            return DeferralEvaluationResult(
                action=DecisionAction.DEFER,
                reason=(
                    f"Deferral approved: verified forecast Jr ({verified_forecast_jr}) is lower than "
                    f"current Jr ({current_best_jr}) - epsilon ({epsilon}); positive slack available ({slack.slack_seconds}s)."
                ),
                slack_seconds=slack.slack_seconds,
                verified_forecast_jr=verified_forecast_jr,
            )

        return DeferralEvaluationResult(
            action=DecisionAction.EXECUTE,
            reason=(
                f"Immediate execution preferred: verified forecast Jr ({verified_forecast_jr}) does not satisfy "
                f"deferral threshold (current Jr {current_best_jr} - epsilon {epsilon})."
            ),
            slack_seconds=slack.slack_seconds,
            verified_forecast_jr=verified_forecast_jr,
        )

    @classmethod
    def evaluate_empty_feasible_pool(cls, slack: DeadlineSlack) -> tuple[Optional[DecisionAction], str]:
        """Determines action when zero feasible candidates exist.

        If Slack > 0: Action is DEFER (transitions to WAITING to await capacity release).
        If Slack <= 0: Action is None (Job transitions to FAILED / UNSCHEDULABLE).
        """
        if slack.is_exhausted:
            return None, f"Unschedulable: zero feasible regions exist and deadline slack is exhausted ({slack.slack_seconds}s)."
        return DecisionAction.DEFER, f"Zero feasible regions currently available; deferring to await capacity deallocation (slack: {slack.slack_seconds}s)."
