"""DecisionEngine orchestrating the complete 12-stage EcoRoute scheduling pipeline."""

from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.carbon.service import CarbonService
from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.decision import SchedulingDecision
from app.domain.exceptions import DomainError
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


class SchedulingEngineError(DomainError):
    """Base exception for Scheduling Engine operational errors."""
    pass


class UnschedulableWorkloadError(SchedulingEngineError):
    """Raised when zero feasible regions exist and deadline slack is exhausted."""
    pass


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

            if action == DecisionAction.DEFER:
                job.transition_to(JobStatus.WAITING)
                decision = SchedulingDecision(
                    job_id=job.id,
                    decision_action=DecisionAction.DEFER,
                    carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
                    carbon_quality_used=CarbonQuality.UNAVAILABLE,
                    decision_reason=empty_reason,
                    score_breakdown={"infeasible_regions": infeasible_log},
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
            raw_metrics[reg.id] = {
                "duration": est.duration_seconds,
                "utilization": reg.current_utilization,
                "latency": reg.network_latency_ms,
                "emissions": est.emissions_co2eq,
            }

        # Stage 7: Min-Max Normalization (Feasible candidates only)
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

        # Stage 9: Deferral & Slack Evaluation
        slack = DeadlineSlack(
            deadline=job.deadline,
            current_time=now,
            estimated_execution_time=winning_candidate.estimate.duration_seconds,
        )

        deferral_res = DeferralEvaluator.evaluate_with_candidates(
            slack=slack,
            current_best_jr=winning_candidate.score_result.cost_score_jr,
            verified_forecast_jr=verified_forecast_jr,
            epsilon=epsilon,
        )

        # Stage 10: State Machine Transitions
        if deferral_res.action == DecisionAction.EXECUTE:
            job.transition_to(JobStatus.DISPATCHED)
            selected_region_id = winning_candidate.region.id
        else:
            job.transition_to(JobStatus.WAITING)
            selected_region_id = None

        # Stage 11: Construct Domain SchedulingDecision
        decision = SchedulingDecision(
            job_id=job.id,
            decision_action=deferral_res.action,
            carbon_source_used=winning_candidate.carbon.source,
            carbon_quality_used=winning_candidate.carbon.quality,
            decision_reason=deferral_res.reason,
            score_breakdown=winning_candidate.score_result.score_breakdown,
            candidate_rankings=[c.to_dict() for c in ranked_candidates],
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
