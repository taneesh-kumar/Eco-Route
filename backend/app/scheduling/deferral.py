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
    verified_forecast_jr: Optional[Decimal] = None
    forecast_status: str = "NO_USEFUL_FORECAST"
    forecast_source: str = "ELECTRICITY_MAPS"
    forecast_checked_until: Optional[str] = None
    deferral_eligible: bool = False
    priority: Optional[int] = None
    priority_class: Optional[str] = None
    deferral_policy: Optional[str] = None
    current_expected_emissions: Optional[Decimal] = None
    future_expected_emissions: Optional[Decimal] = None
    expected_savings: Optional[Decimal] = None
    relative_improvement_pct: Optional[Decimal] = None
    deferral_threshold_pct: Optional[Decimal] = None
    forecast_timestamp: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "action": self.action.value if hasattr(self.action, "value") else str(self.action),
            "reason": self.reason,
            "slack_seconds": float(self.slack_seconds),
            "verified_forecast_jr": float(self.verified_forecast_jr) if self.verified_forecast_jr is not None else None,
            "forecast_status": self.forecast_status,
            "forecast_source": self.forecast_source,
            "forecast_checked_until": self.forecast_checked_until,
            "deferral_eligible": self.deferral_eligible,
            "priority": self.priority,
            "priority_class": self.priority_class,
            "deferral_policy": self.deferral_policy,
            "current_expected_emissions": float(self.current_expected_emissions) if self.current_expected_emissions is not None else None,
            "future_expected_emissions": float(self.future_expected_emissions) if self.future_expected_emissions is not None else None,
            "expected_savings": float(self.expected_savings) if self.expected_savings is not None else None,
            "relative_improvement_pct": float(self.relative_improvement_pct) if self.relative_improvement_pct is not None else None,
            "deferral_threshold_pct": float(self.deferral_threshold_pct) if self.deferral_threshold_pct is not None else None,
            "forecast_timestamp": self.forecast_timestamp,
        }


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
        deferral_eligible: bool = False,
        forecast_status_override: Optional[str] = None,
        job_priority: Optional[int] = None,
        priority_class: Optional[str] = None,
        deferral_policy: Optional[str] = None,
        forecast_checked_until: Optional[str] = None,
        current_expected_emissions: Optional[Decimal] = None,
        future_expected_emissions: Optional[Decimal] = None,
        expected_savings: Optional[Decimal] = None,
        relative_improvement_pct: Optional[Decimal] = None,
        deferral_threshold_pct: Optional[Decimal] = None,
        forecast_timestamp: Optional[str] = None,
    ) -> DeferralEvaluationResult:
        """Determines action when feasible candidate regions exist."""
        if slack.is_exhausted:
            return DeferralEvaluationResult(
                action=DecisionAction.EXECUTE,
                reason="Deadline slack exhausted (Slack <= 0); immediate execution required.",
                slack_seconds=slack.slack_seconds,
                verified_forecast_jr=verified_forecast_jr,
                forecast_status="SLACK_EXHAUSTED",
                deferral_eligible=False,
                priority=job_priority,
                priority_class=priority_class,
                deferral_policy=deferral_policy,
                forecast_checked_until=forecast_checked_until,
                current_expected_emissions=current_expected_emissions,
                deferral_threshold_pct=deferral_threshold_pct,
            )

        if verified_forecast_jr is None:
            status = forecast_status_override or "NO_USEFUL_FORECAST"
            if status in ("UNAVAILABLE", "FORECAST_UNAVAILABLE"):
                status = "FORECAST_UNAVAILABLE"
                reason = "Electricity Maps carbon forecast is unavailable or untrusted; dispatching best candidate immediately."
            else:
                status = "NO_USEFUL_FORECAST"
                reason = "No useful forecast window satisfies the required savings threshold; dispatching best candidate immediately."

            return DeferralEvaluationResult(
                action=DecisionAction.EXECUTE,
                reason=reason,
                slack_seconds=slack.slack_seconds,
                verified_forecast_jr=None,
                forecast_status=status,
                deferral_eligible=deferral_eligible,
                priority=job_priority,
                priority_class=priority_class,
                deferral_policy=deferral_policy,
                forecast_checked_until=forecast_checked_until,
                current_expected_emissions=current_expected_emissions,
                deferral_threshold_pct=deferral_threshold_pct,
            )

        # Deferral condition: J_future < J_current - epsilon
        opportunity_threshold = current_best_jr - epsilon
        if verified_forecast_jr < opportunity_threshold:
            return DeferralEvaluationResult(
                action=DecisionAction.DEFER,
                reason=(
                    f"Deferral approved: verified forecast Jr ({verified_forecast_jr}) provides ≥{deferral_threshold_pct or 15.0}% "
                    f"emissions improvement over immediate execution; positive slack available ({slack.slack_seconds}s)."
                ),
                slack_seconds=slack.slack_seconds,
                verified_forecast_jr=verified_forecast_jr,
                forecast_status="OPPORTUNITY_FOUND",
                deferral_eligible=True,
                priority=job_priority,
                priority_class=priority_class,
                deferral_policy=deferral_policy,
                forecast_checked_until=forecast_checked_until,
                current_expected_emissions=current_expected_emissions,
                future_expected_emissions=future_expected_emissions,
                expected_savings=expected_savings,
                relative_improvement_pct=relative_improvement_pct,
                deferral_threshold_pct=deferral_threshold_pct,
                forecast_timestamp=forecast_timestamp,
            )

        return DeferralEvaluationResult(
            action=DecisionAction.EXECUTE,
            reason=(
                f"Immediate execution preferred: verified forecast does not satisfy "
                f"deferral threshold (current Jr {current_best_jr} - epsilon {epsilon})."
            ),
            slack_seconds=slack.slack_seconds,
            verified_forecast_jr=verified_forecast_jr,
            forecast_status="NO_USEFUL_FORECAST",
            deferral_eligible=deferral_eligible,
            priority=job_priority,
            priority_class=priority_class,
            deferral_policy=deferral_policy,
            forecast_checked_until=forecast_checked_until,
            current_expected_emissions=current_expected_emissions,
            future_expected_emissions=future_expected_emissions,
            expected_savings=expected_savings,
            relative_improvement_pct=relative_improvement_pct,
            deferral_threshold_pct=deferral_threshold_pct,
            forecast_timestamp=forecast_timestamp,
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
