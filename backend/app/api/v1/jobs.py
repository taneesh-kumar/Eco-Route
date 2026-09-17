"""Jobs API endpoints for workload intake and lifecycle inspection."""

from typing import Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.common import PaginatedResponse
from app.api.schemas.jobs import JobResponse, JobSubmissionResponse, WorkloadCreate
from app.db.session import get_db_session
from app.domain.exceptions import DomainError
from app.services.job_service import JobService

router = APIRouter(prefix="/jobs", tags=["Jobs"])
_job_service = JobService()


@router.post("", response_model=JobSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_workload(
    payload: WorkloadCreate,
    session: AsyncSession = Depends(get_db_session),
) -> JobSubmissionResponse:
    """Submits a workload for scheduling evaluation and execution."""
    try:
        db_job, decision, dispatched_attempt = await _job_service.submit_workload(
            payload=payload,
            session=session,
        )
        return JobSubmissionResponse(
            job=JobResponse.model_validate(db_job),
            decision_id=decision.id,
            decision_action=decision.decision_action.value,
            selected_region_id=decision.selected_region_id,
            dispatched_attempt_id=dispatched_attempt.id if dispatched_attempt else None,
        )
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )


@router.get("", response_model=PaginatedResponse[JobResponse])
async def list_jobs(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by JobStatus"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[JobResponse]:
    """Lists submitted computational workloads with pagination and status filters."""
    jobs, total_count = await _job_service.list_jobs(
        session=session,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return PaginatedResponse(
        items=[JobResponse.model_validate(j) for j in jobs],
        total_count=total_count,
        limit=limit,
        offset=offset,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> JobResponse:
    """Retrieves full details of a single workload by ID."""
    job = await _job_service.get_job(job_id=job_id, session=session)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )
    return JobResponse.model_validate(job)


@router.post("/{job_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_job(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Cancels a waiting or pending computational workload."""
    cancelled = await _job_service.cancel_job(job_id=job_id, session=session)
    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job '{job_id}' could not be cancelled (must be WAITING or PENDING).",
        )
    return {"status": "cancelled", "job_id": str(job_id)}
