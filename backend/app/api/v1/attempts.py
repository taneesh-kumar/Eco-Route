"""Attempts API endpoints for region-locked attempt telemetry and inspection."""

from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.attempts import AttemptResponse
from app.db.session import get_db_session
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.repositories.job_attempt_repository import JobAttemptRepository

router = APIRouter(prefix="", tags=["Attempts"])


@router.get("/jobs/{job_id}/attempts", response_model=List[AttemptResponse])
async def list_job_attempts(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> List[AttemptResponse]:
    """Lists all execution attempts for a given workload ordered by attempt number."""
    stmt = (
        select(JobAttempt)
        .where(JobAttempt.job_id == job_id)
        .order_by(JobAttempt.attempt_number.asc())
    )
    res = await session.execute(stmt)
    attempts = list(res.scalars().all())
    return [AttemptResponse.model_validate(a) for a in attempts]


@router.get("/attempts/{attempt_id}", response_model=AttemptResponse)
async def get_attempt(
    attempt_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> AttemptResponse:
    """Retrieves execution telemetry and status for a single attempt."""
    repo = JobAttemptRepository(session)
    attempt = await repo.get_by_id(attempt_id)
    if attempt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attempt '{attempt_id}' not found.",
        )
    return AttemptResponse.model_validate(attempt)
