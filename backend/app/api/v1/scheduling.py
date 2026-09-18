"""Scheduling API endpoints exposing explainability and decision inspection."""

from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.common import PaginatedResponse
from app.api.schemas.scheduling import DecisionExplainabilityResponse, DecisionResponse
from app.db.session import get_db_session
from app.services.scheduling_service import SchedulingQueryService

router = APIRouter(prefix="/scheduling", tags=["Scheduling"])
_scheduling_service = SchedulingQueryService()


@router.get("/decisions", response_model=PaginatedResponse[DecisionResponse])
async def list_decisions(
    job_id: Optional[uuid.UUID] = None,
    region_id: Optional[uuid.UUID] = None,
    action: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[DecisionResponse]:
    """Lists historical scheduling decisions with optional filters."""
    decisions, total_count = await _scheduling_service.list_decisions(
        session=session,
        job_id=job_id,
        region_id=region_id,
        action=action,
        limit=limit,
        offset=offset,
    )
    return PaginatedResponse(
        items=[DecisionResponse.model_validate(d) for d in decisions],
        total_count=total_count,
        limit=limit,
        offset=offset,
    )


@router.get("/decisions/recent", response_model=List[DecisionResponse])
async def list_recent_decisions(
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_db_session),
) -> List[DecisionResponse]:
    """Retrieves the most recent scheduling decisions as a simple list."""
    decisions, _ = await _scheduling_service.list_decisions(
        session=session,
        limit=limit,
        offset=0,
    )
    return [DecisionResponse.model_validate(d) for d in decisions]


@router.get("/decisions/{decision_id}", response_model=DecisionExplainabilityResponse)
async def get_decision_explainability(
    decision_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> DecisionExplainabilityResponse:
    """Retrieves full decision explainability including score breakdown, candidate rankings, and weights."""
    dec = await _scheduling_service.get_decision(decision_id=decision_id, session=session)
    if dec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SchedulingDecision '{decision_id}' not found.",
        )
    return DecisionExplainabilityResponse.model_validate(dec)


@router.get("/jobs/{job_id}/decision", response_model=DecisionExplainabilityResponse)
async def get_latest_decision_for_job(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> DecisionExplainabilityResponse:
    """Retrieves the latest scheduling decision and explainability breakdown for a job."""
    dec = await _scheduling_service.get_latest_for_job(job_id=job_id, session=session)
    if dec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No scheduling decision found for job '{job_id}'.",
        )
    return DecisionExplainabilityResponse.model_validate(dec)




@router.get("/jobs/{job_id}", response_model=List[DecisionResponse])
async def list_decisions_for_job(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> List[DecisionResponse]:
    """Retrieves all historical scheduling decisions for a specific job."""
    decisions, _ = await _scheduling_service.list_decisions(
        session=session,
        job_id=job_id,
        limit=50,
        offset=0,
    )
    return [DecisionResponse.model_validate(d) for d in decisions]


@router.post("/evaluate-deferred", status_code=status.HTTP_200_OK)
async def evaluate_deferred_workloads(
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Triggers an interval-controlled evaluation pass for all WAITING workloads."""
    summary = await _scheduling_service.evaluate_deferred(session=session)
    return {"status": "ok", "summary": summary}


@router.post("/jobs/{job_id}/evaluate", response_model=DecisionExplainabilityResponse)
async def evaluate_single_job(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> DecisionExplainabilityResponse:
    """Evaluates scheduling for a specific pending or waiting job."""
    from app.persistence.repositories.job_repository import JobRepository
    from app.scheduling.engine import DecisionEngine
    from app.domain.job import Job as DomainJob
    from app.domain.values import JobPriority, WorkloadDemand
    from app.persistence.models.enums import JobStatus, WorkloadType, DecisionAction
    from app.execution.dispatcher import ExecutionDispatcher
    from datetime import datetime, timezone

    repo = JobRepository(session)
    db_job = await repo.get_by_id(job_id)
    if not db_job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    now = datetime.now(timezone.utc)
    demand = WorkloadDemand(
        cpu_demand=db_job.cpu_demand,
        memory_demand=db_job.memory_demand,
        base_execution_duration=db_job.base_execution_duration,
    )
    domain_job = DomainJob(
        id=db_job.id,
        workload_name=db_job.workload_name,
        workload_type=WorkloadType(db_job.workload_type),
        demand=demand,
        priority=JobPriority(db_job.priority),
        deadline=db_job.deadline,
        status=JobStatus(db_job.status),
        current_attempt_count=db_job.current_attempt_count,
        max_retries=db_job.max_retries,
        created_at=db_job.created_at,
    )

    engine = DecisionEngine()
    from app.domain.exceptions import UnschedulableWorkloadError
    try:
        decision = await engine.schedule(job=domain_job, current_time=now, session=session)
    except UnschedulableWorkloadError as exc:
        db_job.status = JobStatus.FAILED.value
        db_job.updated_at = now
        await session.flush()
        return DecisionExplainabilityResponse(
            id=uuid.uuid4(),
            job_id=db_job.id,
            attempt_id=None,
            selected_region_id=None,
            decision_action=DecisionAction.REJECT.value,
            cost_score_jr=None,
            estimated_energy_kwh=None,
            estimated_co2eq_grams=None,
            carbon_source_used="ELECTRICITY_MAPS",
            carbon_quality_used="UNAVAILABLE",
            decision_reason=str(exc),
            score_breakdown={"rejection_reason": str(exc)},
            candidate_rankings=[],
            applied_weights={},
            normalization_factors={},
            created_at=now,
        )

    if decision.decision_action == DecisionAction.EXECUTE:
        dispatcher = ExecutionDispatcher()
        await dispatcher.dispatch_decision(decision, session=session)
    elif decision.decision_action == DecisionAction.DEFER:
        db_job.status = JobStatus.WAITING.value
        db_job.updated_at = now
        await session.flush()
    elif decision.decision_action == DecisionAction.REJECT:
        db_job.status = JobStatus.FAILED.value
        db_job.updated_at = now
        await session.flush()

    return DecisionExplainabilityResponse(
        id=decision.id,
        job_id=decision.job_id,
        attempt_id=None,
        selected_region_id=decision.selected_region_id,
        decision_action=decision.decision_action.value if hasattr(decision.decision_action, "value") else str(decision.decision_action),
        cost_score_jr=decision.cost_score_jr,
        estimated_energy_kwh=decision.estimated_energy_kwh,
        estimated_co2eq_grams=decision.estimated_co2eq_grams,
        carbon_source_used=decision.carbon_source_used.value if hasattr(decision.carbon_source_used, "value") else str(decision.carbon_source_used),
        carbon_quality_used=decision.carbon_quality_used.value if hasattr(decision.carbon_quality_used, "value") else str(decision.carbon_quality_used),
        decision_reason=decision.decision_reason,
        score_breakdown=decision.score_breakdown,
        candidate_rankings=decision.candidate_rankings,
        applied_weights=decision.applied_weights,
        normalization_factors=decision.normalization_factors,
        created_at=now,
    )
