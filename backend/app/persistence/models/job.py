import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, TYPE_CHECKING
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.persistence.models.base import Base
from app.persistence.models.enums import JobStatus

if TYPE_CHECKING:
    from app.persistence.models.job_attempt import JobAttempt
    from app.persistence.models.scheduling_decision import SchedulingDecision
    from app.persistence.models.audit_event import AuditEvent


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    workload_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    workload_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    cpu_demand: Mapped[Decimal] = mapped_column(
        Numeric(8, 2),
        nullable=False,
    )
    memory_demand: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    base_execution_duration: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    priority: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    deadline: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=JobStatus.PENDING.value,
    )
    current_attempt_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    max_retries: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=3,
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
    attempts: Mapped[List["JobAttempt"]] = relationship(
        "JobAttempt",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="JobAttempt.attempt_number",
    )
    scheduling_decisions: Mapped[List["SchedulingDecision"]] = relationship(
        "SchedulingDecision",
        back_populates="job",
        cascade="all, delete-orphan",
    )
    audit_events: Mapped[List["AuditEvent"]] = relationship(
        "AuditEvent",
        back_populates="job",
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("status", JobStatus.PENDING.value)
        kwargs.setdefault("current_attempt_count", 0)
        kwargs.setdefault("max_retries", 3)
        super().__init__(**kwargs)

    __table_args__ = (
        CheckConstraint("cpu_demand > 0", name="chk_jobs_cpu_demand_positive"),
        CheckConstraint("memory_demand > 0", name="chk_jobs_memory_demand_positive"),
        CheckConstraint(
            "base_execution_duration > 0",
            name="chk_jobs_base_execution_duration_positive",
        ),
        CheckConstraint(
            "priority >= 1 AND priority <= 10",
            name="chk_jobs_priority_range",
        ),
        CheckConstraint(
            "status IN ('PENDING', 'EVALUATING', 'WAITING', 'DISPATCHED', 'RUNNING', 'COMPLETED', 'FAILED')",
            name="chk_jobs_valid_status",
        ),
        CheckConstraint(
            "current_attempt_count >= 0",
            name="chk_jobs_current_attempt_count_non_negative",
        ),
        CheckConstraint("max_retries >= 0", name="chk_jobs_max_retries_non_negative"),
        Index("ix_jobs_status_deadline", "status", "deadline"),
    )
