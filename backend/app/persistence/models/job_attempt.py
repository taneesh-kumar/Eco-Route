import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.persistence.models.base import Base
from app.persistence.models.enums import AttemptStatus

if TYPE_CHECKING:
    from app.persistence.models.job import Job
    from app.persistence.models.region import Region
    from app.persistence.models.scheduling_decision import SchedulingDecision
    from app.persistence.models.audit_event import AuditEvent


class JobAttempt(Base):
    __tablename__ = "job_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attempt_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )
    region_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("regions.id"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=AttemptStatus.PENDING.value,
        index=True,
    )
    claimed_by_worker: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    claimed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    actual_duration: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )
    actual_energy_kwh: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 6),
        nullable=True,
    )
    actual_co2eq_grams: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 4),
        nullable=True,
    )
    error_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    job: Mapped["Job"] = relationship(
        "Job",
        back_populates="attempts",
    )
    region: Mapped["Region"] = relationship(
        "Region",
        back_populates="attempts",
    )
    scheduling_decisions: Mapped[List["SchedulingDecision"]] = relationship(
        "SchedulingDecision",
        back_populates="attempt",
    )
    audit_events: Mapped[List["AuditEvent"]] = relationship(
        "AuditEvent",
        back_populates="attempt",
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("attempt_number", 1)
        kwargs.setdefault("status", AttemptStatus.PENDING.value)
        super().__init__(**kwargs)

    __table_args__ = (
        UniqueConstraint("job_id", "attempt_number", name="uq_job_attempts_job_attempt"),
        CheckConstraint("attempt_number >= 1", name="chk_job_attempts_attempt_number_positive"),
        CheckConstraint(
            "status IN ('PENDING', 'CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED')",
            name="chk_job_attempts_valid_status",
        ),
    )
