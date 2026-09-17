"""Scheduling API endpoints exposing explainability and decision inspection."""

from typing import Optional
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
    return DecisionExplainabilityResponse(
        id=dec.id,
        job_id=dec.job_id,
        attempt_id=dec.attempt_id,
        selected_region_id=dec.selected_region_id,
        decision_action=dec.decision_action,
        cost_score_jr=dec.cost_score_jr,
        estimated_energy_kwh=dec.estimated_energy_kwh,
        estimated_co2eq_grams=dec.estimated_co2eq_grams,
        carbon_source_used=dec.carbon_source_used,
        carbon_quality_used=dec.carbon_quality_used,
        decision_reason=dec.decision_reason,
        score_breakdown=dec.score_breakdown,
        candidate_rankings=dec.candidate_rankings,
        applied_weights=dec.applied_weights,
        normalization_factors=dec.normalization_factors,
        created_at=dec.created_at,
    )


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
    return DecisionExplainabilityResponse(
        id=dec.id,
        job_id=dec.job_id,
        attempt_id=dec.attempt_id,
        selected_region_id=dec.selected_region_id,
        decision_action=dec.decision_action,
        cost_score_jr=dec.cost_score_jr,
        estimated_energy_kwh=dec.estimated_energy_kwh,
        estimated_co2eq_grams=dec.estimated_co2eq_grams,
        carbon_source_used=dec.carbon_source_used,
        carbon_quality_used=dec.carbon_quality_used,
        decision_reason=dec.decision_reason,
        score_breakdown=dec.score_breakdown,
        candidate_rankings=dec.candidate_rankings,
        applied_weights=dec.applied_weights,
        normalization_factors=dec.normalization_factors,
        created_at=dec.created_at,
    )


@router.post("/evaluate-deferred", status_code=status.HTTP_200_OK)
async def evaluate_deferred_workloads(
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Triggers an interval-controlled evaluation pass for all WAITING workloads."""
    summary = await _scheduling_service.evaluate_deferred(session=session)
    return {"status": "ok", "summary": summary}
