"""Analytics API endpoints for sustainability KPIs and audit records."""

from typing import Optional
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.analytics import AnalyticsSummaryResponse, AuditEventResponse
from app.api.schemas.common import PaginatedResponse
from app.db.session import get_db_session
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["Analytics"])
_analytics_service = AnalyticsService()


@router.get("/summary", response_model=AnalyticsSummaryResponse)
async def get_sustainability_summary(
    session: AsyncSession = Depends(get_db_session),
) -> AnalyticsSummaryResponse:
    """Returns verified aggregate sustainability KPIs and SLA compliance rates."""
    return await _analytics_service.get_summary(session=session)


@router.get("/audit-events", response_model=PaginatedResponse[AuditEventResponse])
async def list_audit_events(
    event_type: Optional[str] = None,
    job_id: Optional[uuid.UUID] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[AuditEventResponse]:
    """Retrieves paginated immutable audit trail logs."""
    events, total_count = await _analytics_service.list_audit_events(
        session=session,
        event_type=event_type,
        job_id=job_id,
        limit=limit,
        offset=offset,
    )
    return PaginatedResponse(
        items=[AuditEventResponse.model_validate(e) for e in events],
        total_count=total_count,
        limit=limit,
        offset=offset,
    )
