"""DecisionEngine orchestrating the complete 12-stage EcoRoute scheduling pipeline."""

from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.carbon.service import CarbonService
from app.core.config import get_settings
from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.decision import SchedulingDecision
from app.domain.exceptions import DomainError, SchedulingEngineError, UnschedulableWorkloadError
from app.domain.job import Job
from app.domain.region import Region
from app.domain.values import DeadlineSlack
from app.persistence.models.enums import DecisionAction, JobStatus, SchedulerVariant
from app.persistence.repositories.region_repository import RegionRepository
from app.persistence.repositories.scheduling_decision_repository import (
    SchedulingDecisionRepository,
)
from app.scheduling.deferral import DeferralEvaluator
from app.scheduling.energy_estimator import EnergyEstimator
from app.scheduling.normalizer import Normalizer
from app.scheduling.strategies import get_scheduler_strategy

logger = logging.getLogger(__name__)


class DecisionEngine:
    """Central orchestrator for the EcoRoute scheduling pipeline.

    Coordinates:
    1. Validation & Intake
    2. Candidate Discovery
    3. Hard Constraint Evaluation
    4. Feasible Pool Verification
    5. Carbon Resolution (with zero-fabrication guarantees)
    6. Energy & Differential Power Modeling
    7. Emissions Estimation
    8. Min-Max Normalization over feasible pool
    9. Jr Scoring across 5 Scheduler Variants
    10. Deterministic Ranking & Tie-Breaking
    11. Deadline Slack & Deferral Gating
    12. State Machine Transitions & Durable Decision Persistence
    """

    def __init__(
        self,
        carbon_service: Optional[CarbonService] = None,
    ) -> None:
        self.carbon_service = carbon_service or CarbonService()

    async def schedule(
        self,
        job: Job,
        candidate_regions: Optional[List[Region]] = None,
        variant: SchedulerVariant = SchedulerVariant.ECOROUTE,
        current_time: Optional[datetime] = None,
        verified_forecast_jr: Optional[Decimal] = None,
        epsilon: Decimal = Decimal("0.0"),
        random_seed: Optional[int] = None,
        session: Optional[AsyncSession] = None,
    ) -> SchedulingDecision:
        """Executes the full 12-stage scheduling evaluation for a workload."""
        now = current_time or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        # Stage 1: Transition to EVALUATING
        if job.status == JobStatus.PENDING or job.status == JobStatus.WAITING:
            job.transition_to(JobStatus.EVALUATING)

        # Stage 2: Discover Candidate Regions
        if candidate_regions is None:
            if session is None:
                raise SchedulingEngineError("Cannot discover candidate regions without active DB session or region list.")
            region_repo = RegionRepository(session)
            db_regions = await region_repo.list_active()
            candidate_regions = [
                Region(
                    id=r.id,
                    code=r.code,
                    name=r.name,
                    provider=r.provider,
                    max_cpu_capacity=r.max_cpu_capacity,
                    max_memory_capacity=r.max_memory_capacity,
                    current_utilization=r.current_utilization,
                    performance_factor=r.performance_factor,
                    idle_power_watts=r.idle_power_watts,
                    peak_power_watts=r.peak_power_watts,
                    network_latency_ms=r.network_latency_ms,
                    is_available=r.is_available,
                    is_active=r.is_active,
                )
                for r in db_regions
            ]

        # Stage 3: Hard Constraint Evaluation
        feasible_regions: List[Region] = []
        infeasible_log: List[Dict[str, str]] = []

        for reg in candidate_regions:
            rejection_reason = reg.get_infeasibility_reason(
                demand=job.demand,
                current_time=now,
                deadline=job.deadline,
            )
            if rejection_reason is None:
                feasible_regions.append(reg)
            else:
                infeasible_log.append({"region_code": reg.code, "reason": rejection_reason})

        # Stage 4: Feasible Pool Verification
        if not feasible_regions:
            # Handle empty feasible pool using finalized slack condition
            slack_empty = job.calculate_slack(current_time=now)
            action, empty_reason = DeferralEvaluator.evaluate_empty_feasible_pool(slack_empty)
            status_empty = "NO_FEASIBLE_CANDIDATES"

            logger.warning(
                "[DECISION_DIAGNOSTIC] Job %s has zero feasible regions. Slack: %ss. Status: %s. Reason: %s",
                job.id,
                slack_empty.slack_seconds,
                status_empty,
                empty_reason,
            )

            if action == DecisionAction.DEFER:
                job.transition_to(JobStatus.WAITING)
                decision = SchedulingDecision(
                    job_id=job.id,
                    decision_action=DecisionAction.DEFER,
                    decision_mode="DEFERRED",
                    carbon_optimization_applied=False,
                    fallback_reason="No candidate regions are currently feasible within operational constraints.",
                    carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
                    carbon_quality_used=CarbonQuality.UNAVAILABLE,
                    decision_reason=empty_reason,
                    score_breakdown={
                        "infeasible_regions": infeasible_log,
                        "deferral_info": {
                            "action": "DEFER",
                            "reason": empty_reason,
                            "slack_seconds": float(slack_empty.slack_seconds),
                            "forecast_status": status_empty,
                            "deferral_eligible": False,
                        },
                    },
                    candidate_rankings=[],
                    applied_weights=get_scheduler_strategy(variant).get_effective_weights(False),
                    selected_region_id=None,
                    cost_score_jr=None,
                    estimated_energy_kwh=None,
                    estimated_co2eq_grams=None,
                    normalization_factors={},
                    created_at=now,
                )
                if session is not None:
                    dec_repo = SchedulingDecisionRepository(session)
                    await dec_repo.record_decision(decision)
                return decision
            else:
                # Slack exhausted: job transitions to FAILED
                job.transition_to(JobStatus.FAILED)
                raise UnschedulableWorkloadError(empty_reason)

        # Stage 5: Carbon Resolution & Partial Availability Check
        carbon_obs: Dict[uuid.UUID, CarbonIntensity] = {}
        for reg in feasible_regions:
            carbon_obs[reg.id] = await self.carbon_service.get_carbon_intensity(reg, session)

        # Blocker #2 resolution: If ANY feasible candidate has untrusted/unavailable carbon,
        # evaluation-wide fallback is triggered for ECOROUTE.
        carbon_available = all(obs.is_trustworthy for obs in carbon_obs.values())

        # Stage 6: Energy & Emissions Estimation
        estimates = {}
        raw_metrics = {}
        for reg in feasible_regions:
            est = EnergyEstimator.estimate_for_region(
                demand=job.demand,
                region=reg,
                carbon=carbon_obs[reg.id],
            )
            estimates[reg.id] = est
            projected_u = (
                est.u_after
                if est.u_after is not None
                else reg.current_utilization + (job.demand.cpu_demand / reg.max_cpu_capacity)
            )
            raw_metrics[reg.id] = {
                "duration": est.duration_seconds,
                "utilization": projected_u,
                "latency": reg.network_latency_ms,
                "emissions": est.emissions_co2eq,
            }

        # Stage 7: Min-Max Normalization (Feasible candidates only, using projected utilization)
        norm_metrics, norm_factors = Normalizer.normalize_candidates(raw_metrics)

        # Stage 8: Strategy Scoring & Ranking across the 5 variants
        strategy = get_scheduler_strategy(variant)
        candidate_tuples = [
            (reg, estimates[reg.id], carbon_obs[reg.id])
            for reg in feasible_regions
        ]
        ranked_candidates = strategy.rank_candidates(
            candidates=candidate_tuples,
            normalized_metrics=norm_metrics,
            carbon_available=carbon_available,
            random_seed=random_seed,
        )

        winning_candidate = ranked_candidates[0]

        # Stage 8b: Evaluate Counterfactual Conventional Baseline (Critical Rule #23)
        baseline_strategy_name = "CONVENTIONAL"
        conv_strat = get_scheduler_strategy(SchedulerVariant.CONVENTIONAL)
        conv_ranked = conv_strat.rank_candidates(
            candidates=candidate_tuples,
            normalized_metrics=norm_metrics,
            carbon_available=carbon_available,
            random_seed=random_seed,
        )
        baseline_winner = conv_ranked[0]
        baseline_region_id = baseline_winner.region.id
        baseline_energy_kwh = baseline_winner.estimate.energy_kwh
        baseline_co2eq_grams = baseline_winner.estimate.emissions_co2eq

        if (
            baseline_co2eq_grams is not None
            and winning_candidate.estimate.emissions_co2eq is not None
        ):
            diff = baseline_co2eq_grams - winning_candidate.estimate.emissions_co2eq
            estimated_savings_co2eq_grams = max(Decimal("0.0"), diff)
        else:
            estimated_savings_co2eq_grams = None

        # Stage 9: Deferral & Slack Evaluation
        slack = DeadlineSlack(
            deadline=job.deadline,
            current_time=now,
            estimated_execution_time=winning_candidate.estimate.duration_seconds,
        )

        # Stage 9: Deferral & Slack Evaluation
        slack = DeadlineSlack(
            deadline=job.deadline,
            current_time=now,
            estimated_execution_time=winning_candidate.estimate.duration_seconds,
        )

        settings = get_settings()
        min_rel_imp = Decimal(str(settings.CARBON_DEFERRAL_MIN_RELATIVE_IMPROVEMENT))
        threshold_ratio = Decimal("1.0") - min_rel_imp
        deferral_threshold_pct = min_rel_imp * Decimal("100")
        eff_epsilon = Decimal(str(settings.CARBON_DEFERRAL_EPSILON)) if epsilon == Decimal("0.0") else epsilon

        deferral_eligible = job.priority.allows_carbon_deferral and carbon_available
        from datetime import timedelta
        forecast_checked_until = (now + timedelta(seconds=float(slack.slack_seconds))).isoformat() if slack.slack_seconds > 0 else None
        found_future_emiss = None
        found_savings = None
        found_rel_imp = None
        found_forecast_ts = None

        p_val = job.priority.value
        p_class = job.priority.priority_class
        if p_class == "HIGH":
            deferral_policy = "Ineligible (HIGH - Urgent SLA)"
        elif p_class == "MEDIUM":
            deferral_policy = "Eligible (MEDIUM - Balanced SLA)"
        else:
            deferral_policy = "Eligible (LOW - Flexible SLA)"

        curr_emiss = winning_candidate.estimate.emissions_co2eq
        target_cap = curr_emiss * threshold_ratio if curr_emiss is not None else None

        logger.info(
            "[DECISION_DIAGNOSTIC] Job %s (%s, Priority %s %s) | Deadline: %s | Slack: %ss | Best Candidate: %s (CI: %s gCO2eq/kWh, Dur: %ss, Energy: %s kWh, Emiss: %s gCO2eq) | Deferral Eligible: %s (Policy: %s)",
            job.id,
            job.workload_type,
            p_val,
            p_class,
            job.deadline.isoformat(),
            slack.slack_seconds,
            winning_candidate.region.code,
            winning_candidate.carbon.value,
            winning_candidate.estimate.duration_seconds,
            winning_candidate.estimate.energy_kwh,
            curr_emiss,
            deferral_eligible,
            deferral_policy,
        )

        active_forecast_jr = verified_forecast_jr
        forecast_status_code = "NO_USEFUL_FORECAST"
        if not carbon_available:
            forecast_status_code = "FORECAST_UNAVAILABLE"
        elif active_forecast_jr is None and deferral_eligible:
            try:
                found_pts_in_api = False
                pts_in_window_count = 0
                for reg in feasible_regions:
                    pts = await self.carbon_service.get_forecast(reg)
                    if pts:
                        found_pts_in_api = True
                        reg_est = estimates[reg.id]
                        dur_sec = float(reg_est.duration_seconds)
                        for pt in pts:
                            proj_completion = pt.timestamp + timedelta(seconds=dur_sec)
                            if pt.timestamp > now and proj_completion <= job.deadline:
                                pts_in_window_count += 1
                                if curr_emiss is not None and curr_emiss > Decimal("0"):
                                    future_emiss = reg_est.energy_kwh * pt.carbon_intensity
                                    diff = curr_emiss - future_emiss
                                    rel_imp = (diff / curr_emiss) * Decimal("100")
                                    if future_emiss < target_cap:
                                        active_forecast_jr = Decimal("0.01")
                                        found_future_emiss = future_emiss
                                        found_savings = diff
                                        found_rel_imp = rel_imp
                                        found_forecast_ts = pt.timestamp.isoformat()
                                        forecast_status_code = "OPPORTUNITY_FOUND"
                                        logger.info(
                                            "[DECISION_DIAGNOSTIC] Forecast opportunity identified in region %s (zone %s) at %s: CI=%s gCO2eq/kWh, FutureEmiss=%s gCO2eq (Savings=%s%% >= %s%% threshold)",
                                            reg.code,
                                            self.carbon_service.resolve_zone_code(reg),
                                            found_forecast_ts,
                                            pt.carbon_intensity,
                                            future_emiss,
                                            rel_imp,
                                            deferral_threshold_pct,
                                        )
                                        break
                    if active_forecast_jr is not None:
                        break

                if not found_pts_in_api and active_forecast_jr is None:
                    forecast_status_code = "FORECAST_UNAVAILABLE"
                    logger.info(
                        "[DECISION_DIAGNOSTIC] Forecast API returned zero forecast points across candidate regions. Status: FORECAST_UNAVAILABLE"
                    )
                elif pts_in_window_count == 0 and active_forecast_jr is None:
                    logger.info(
                        "[DECISION_DIAGNOSTIC] Forecast points exist outside deadline, but zero points fell inside deferral window [%s, %s]. Status: NO_USEFUL_FORECAST",
                        now.isoformat(),
                        forecast_checked_until,
                    )
                elif active_forecast_jr is None:
                    logger.info(
                        "[DECISION_DIAGNOSTIC] Checked %d forecast points inside deferral window [%s, %s]; none satisfied >= %s%% savings threshold (target cap < %s gCO2eq). Status: NO_USEFUL_FORECAST",
                        pts_in_window_count,
                        now.isoformat(),
                        forecast_checked_until,
                        deferral_threshold_pct,
                        target_cap,
                    )
            except Exception as exc:
                logger.warning("[DECISION_DIAGNOSTIC] Forecast query error: %s. Falling back to FORECAST_UNAVAILABLE.", exc)
                forecast_status_code = "FORECAST_UNAVAILABLE"

        deferral_res = DeferralEvaluator.evaluate_with_candidates(
            slack=slack,
            current_best_jr=winning_candidate.score_result.cost_score_jr,
            verified_forecast_jr=active_forecast_jr,
            epsilon=eff_epsilon,
            deferral_eligible=deferral_eligible,
            forecast_status_override=forecast_status_code,
            job_priority=p_val,
            priority_class=p_class,
            deferral_policy=deferral_policy,
            forecast_checked_until=forecast_checked_until,
            current_expected_emissions=winning_candidate.estimate.emissions_co2eq,
            future_expected_emissions=found_future_emiss,
            expected_savings=found_savings,
            relative_improvement_pct=found_rel_imp,
            deferral_threshold_pct=deferral_threshold_pct,
            forecast_timestamp=found_forecast_ts,
        )

        # Stage 10: State Machine Transitions & Decision Mode Determination
        if carbon_available:
            if deferral_res.action == DecisionAction.DEFER:
                decision_mode = "DEFERRED"
                carbon_optimization_applied = True
                fallback_reason = None
            else:
                decision_mode = "CARBON_AWARE"
                carbon_optimization_applied = True
                fallback_reason = None
        else:
            decision_mode = "CONVENTIONAL_FALLBACK"
            carbon_optimization_applied = False
            fallback_reason = (
                "Carbon data unavailable or untrusted across candidate regions; "
                "bypassed carbon optimization and applied conventional operational scheduling."
            )

        if deferral_res.action == DecisionAction.EXECUTE:
            job.transition_to(JobStatus.DISPATCHED)
            selected_region_id = winning_candidate.region.id
        else:
            job.transition_to(JobStatus.WAITING)
            selected_region_id = None

        logger.info(
            "[DECISION_DIAGNOSTIC] Final Decision for Job %s: Action=%s | ForecastStatus=%s | DecisionMode=%s | SelectedRegion=%s | Reason=%s",
            job.id,
            deferral_res.action.value,
            deferral_res.forecast_status,
            decision_mode,
            winning_candidate.region.code if deferral_res.action == DecisionAction.EXECUTE else "NONE (DEFERRED)",
            deferral_res.reason,
        )

        # Stage 11: Construct Domain SchedulingDecision
        rankings_payload = [c.to_dict() for c in ranked_candidates]
        for inf in infeasible_log:
            rankings_payload.append({
                "rank": len(rankings_payload) + 1,
                "region_id": inf.get("region_id", ""),
                "region_code": inf.get("region_code", ""),
                "region_name": inf.get("region_name", inf.get("region_code", "")),
                "is_feasible": False,
                "rejection_reason": inf.get("reason", "Hard constraint violation"),
                "composite_score": None,
                "cost_score_jr": None,
                "raw_carbon_gco2": None,
                "raw_latency_ms": None,
                "norm_carbon": None,
                "norm_duration": None,
                "norm_utilization": None,
                "norm_latency": None,
            })

        # Canonical single authoritative snapshot of the selected candidate
        selected_candidate_snapshot = {
            "selected_region_id": str(winning_candidate.region.id) if deferral_res.action == DecisionAction.EXECUTE else None,
            "selected_region_code": winning_candidate.region.code if deferral_res.action == DecisionAction.EXECUTE else None,
            "carbon_intensity_gco2_per_kwh": float(winning_candidate.carbon.value) if winning_candidate.carbon.value is not None else None,
            "carbon_source": winning_candidate.carbon.source.value,
            "carbon_quality": winning_candidate.carbon.quality.value,
            "carbon_is_estimated": winning_candidate.carbon.is_estimated,
            "carbon_estimation_method": winning_candidate.carbon.estimation_method or ("Electricity Maps Live Model" if winning_candidate.carbon.is_estimated else None),
            "carbon_observed_at": winning_candidate.carbon.observed_at.isoformat() if winning_candidate.carbon.observed_at else None,
            "carbon_cache_age_seconds": (
                winning_candidate.carbon.cache_age_seconds
                if winning_candidate.carbon.cache_age_seconds is not None
                else (
                    int((now - winning_candidate.carbon.received_at).total_seconds())
                    if winning_candidate.carbon.received_at
                    else None
                )
            ),
            "carbon_max_cache_age_seconds": settings.CARBON_CACHE_MAX_AGE_SECONDS,
            "energy_kwh": str(winning_candidate.estimate.energy_kwh),
            "estimated_emissions_co2eq_grams": (
                str(winning_candidate.estimate.emissions_co2eq)
                if winning_candidate.estimate.emissions_co2eq is not None
                else None
            ),
            "duration_seconds": str(winning_candidate.estimate.duration_seconds),
            "projected_utilization": float(
                winning_candidate.estimate.u_after
                if winning_candidate.estimate.u_after is not None
                else winning_candidate.region.current_utilization
            ),
            "latency_ms": float(winning_candidate.region.network_latency_ms),
            "composite_score": float(winning_candidate.score_result.cost_score_jr),
        } if deferral_res.action == DecisionAction.EXECUTE else None

        score_breakdown_dict = dict(winning_candidate.score_result.score_breakdown or {})
        score_breakdown_dict["selected_candidate"] = selected_candidate_snapshot
        score_breakdown_dict["deferral_info"] = deferral_res.to_dict()

        decision = SchedulingDecision(
            job_id=job.id,
            decision_action=deferral_res.action,
            decision_mode=decision_mode,
            carbon_optimization_applied=carbon_optimization_applied,
            fallback_reason=fallback_reason,
            baseline_strategy=baseline_strategy_name,
            baseline_region_id=baseline_region_id,
            baseline_energy_kwh=baseline_energy_kwh,
            baseline_co2eq_grams=baseline_co2eq_grams,
            estimated_savings_co2eq_grams=estimated_savings_co2eq_grams,
            carbon_source_used=winning_candidate.carbon.source,
            carbon_quality_used=winning_candidate.carbon.quality,
            decision_reason=deferral_res.reason,
            score_breakdown=score_breakdown_dict,
            candidate_rankings=rankings_payload,
            applied_weights=winning_candidate.score_result.applied_weights,
            selected_region_id=selected_region_id,
            cost_score_jr=winning_candidate.score_result.cost_score_jr,
            estimated_energy_kwh=winning_candidate.estimate.energy_kwh,
            estimated_co2eq_grams=winning_candidate.estimate.emissions_co2eq,
            normalization_factors=norm_factors,
            created_at=now,
        )

        # Stage 12: Durable Persistence
        if session is not None:
            dec_repo = SchedulingDecisionRepository(session)
            await dec_repo.record_decision(decision)

        return decision
