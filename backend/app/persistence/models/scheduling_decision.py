import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, TYPE_CHECKING
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    desc,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.persistence.models.base import Base
from app.persistence.models.enums import DecisionAction

if TYPE_CHECKING:
    from app.persistence.models.job import Job
    from app.persistence.models.job_attempt import JobAttempt
    from app.persistence.models.region import Region


class SchedulingDecision(Base):
    __tablename__ = "scheduling_decisions"

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
    attempt_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_attempts.id"),
        nullable=True,
        index=True,
    )
    selected_region_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("regions.id"),
        nullable=True,
        index=True,
    )
    decision_action: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=DecisionAction.EXECUTE.value,
    )
    decision_mode: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="CARBON_AWARE",
    )
    carbon_optimization_applied: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )
    fallback_reason: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    baseline_strategy: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )
    baseline_region_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("regions.id"),
        nullable=True,
    )
    baseline_energy_kwh: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 6),
        nullable=True,
    )
    baseline_co2eq_grams: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 4),
        nullable=True,
    )
    estimated_savings_co2eq_grams: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 4),
        nullable=True,
    )
    cost_score_jr: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(8, 6),
        nullable=True,
    )
    estimated_energy_kwh: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 6),
        nullable=True,
    )
    estimated_co2eq_grams: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 4),
        nullable=True,
    )
    carbon_source_used: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    carbon_quality_used: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    decision_reason: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    score_breakdown: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
    )
    candidate_rankings: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
    )
    applied_weights: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
    )
    normalization_factors: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    job: Mapped["Job"] = relationship(
        "Job",
        back_populates="scheduling_decisions",
    )
    attempt: Mapped[Optional["JobAttempt"]] = relationship(
        "JobAttempt",
        back_populates="scheduling_decisions",
    )
    selected_region: Mapped[Optional["Region"]] = relationship(
        "Region",
        back_populates="scheduling_decisions",
        foreign_keys=[selected_region_id],
    )

    __table_args__ = (
        CheckConstraint(
            "decision_action IN ('EXECUTE', 'DEFER', 'REJECT')",
            name="chk_scheduling_decisions_valid_action",
        ),
        Index("ix_scheduling_decisions_job_time", "job_id", desc("created_at")),
    )
