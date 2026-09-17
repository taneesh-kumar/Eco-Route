import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.persistence.models.audit_event import AuditEvent
from app.persistence.repositories.base import BaseRepository


class AuditEventRepository(BaseRepository[AuditEvent]):
    """Repository for managing immutable audit trail records."""

    def __init__(self, session: AsyncSession):
        super().__init__(AuditEvent, session)

    async def record_event(
        self,
        event_type: str,
        actor: str,
        job_id: Optional[uuid.UUID] = None,
        attempt_id: Optional[uuid.UUID] = None,
        event_metadata: Optional[Dict[str, Any]] = None,
        event_timestamp: Optional[datetime] = None,
    ) -> AuditEvent:
        """Appends an immutable audit event to the durable audit trail."""
        now = event_timestamp or datetime.now(timezone.utc)
        event = AuditEvent(
            id=uuid.uuid4(),
            event_type=event_type,
            actor=actor,
            job_id=job_id,
            attempt_id=attempt_id,
            event_metadata=event_metadata or {},
            event_timestamp=now,
        )
        self.session.add(event)
        await self.session.flush()
        return event

    async def list_by_job(
        self,
        job_id: uuid.UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> List[AuditEvent]:
        stmt = (
            select(AuditEvent)
            .where(AuditEvent.job_id == job_id)
            .order_by(AuditEvent.event_timestamp.asc())
            .limit(limit)
            .offset(offset)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def list_events(
        self,
        event_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[AuditEvent]:
        stmt = select(AuditEvent)
        if event_type:
            stmt = stmt.where(AuditEvent.event_type == event_type)
        stmt = stmt.order_by(AuditEvent.event_timestamp.desc()).limit(limit).offset(offset)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())
