import uuid
from datetime import datetime
from typing import Any, Dict, Optional, TYPE_CHECKING
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    desc,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.persistence.models.base import Base

if TYPE_CHECKING:
    from app.persistence.models.job import Job
    from app.persistence.models.job_attempt import JobAttempt


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    attempt_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_attempts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    actor: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    event_metadata: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )
    event_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    job: Mapped[Optional["Job"]] = relationship(
        "Job",
        back_populates="audit_events",
    )
    attempt: Mapped[Optional["JobAttempt"]] = relationship(
        "JobAttempt",
        back_populates="audit_events",
    )

    __table_args__ = (
        Index("ix_audit_events_job_time", "job_id", desc("event_timestamp")),
    )
