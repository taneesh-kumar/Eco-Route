import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.persistence.models.base import Base
from app.persistence.models.enums import ExperimentStatus, SchedulerVariant


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    scheduler_variant: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    random_seed: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    scenario_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    workload_configuration: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
    )
    region_configuration: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=ExperimentStatus.PENDING.value,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    results: Mapped[List["ExperimentResult"]] = relationship(
        "ExperimentResult",
        back_populates="experiment",
        cascade="all, delete-orphan",
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("status", ExperimentStatus.PENDING.value)
        super().__init__(**kwargs)

    __table_args__ = (
        CheckConstraint(
            "scheduler_variant IN ('CONVENTIONAL', 'RANDOM', 'CARBON_ONLY', 'PERFORMANCE_ONLY', 'ECOROUTE')",
            name="chk_experiments_valid_scheduler_variant",
        ),
        CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')",
            name="chk_experiments_valid_status",
        ),
    )


class ExperimentResult(Base):
    __tablename__ = "experiment_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("experiments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scheduler_algorithm: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    total_energy_kwh: Mapped[Decimal] = mapped_column(
        Numeric(12, 6),
        nullable=False,
    )
    total_co2eq_grams: Mapped[Decimal] = mapped_column(
        Numeric(12, 4),
        nullable=False,
    )
    avg_execution_time_seconds: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    avg_latency_ms: Mapped[Decimal] = mapped_column(
        Numeric(8, 2),
        nullable=False,
    )
    deadline_compliance_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 4),
        nullable=False,
    )
    failure_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 4),
        nullable=False,
    )
    retry_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 4),
        nullable=False,
    )
    duplicate_execution_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    deferral_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 4),
        nullable=False,
        default=Decimal("0.0"),
    )
    avg_region_utilization: Mapped[Decimal] = mapped_column(
        Numeric(5, 4),
        nullable=False,
        default=Decimal("0.0"),
    )
    detailed_metrics: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    experiment: Mapped["Experiment"] = relationship(
        "Experiment",
        back_populates="results",
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("duplicate_execution_count", 0)
        kwargs.setdefault("deferral_rate", Decimal("0.0"))
        kwargs.setdefault("avg_region_utilization", Decimal("0.0"))
        kwargs.setdefault("detailed_metrics", {})
        super().__init__(**kwargs)

    __table_args__ = (
        CheckConstraint(
            "deadline_compliance_rate >= 0.0 AND deadline_compliance_rate <= 1.0",
            name="chk_exp_results_deadline_compliance_range",
        ),
        CheckConstraint(
            "failure_rate >= 0.0 AND failure_rate <= 1.0",
            name="chk_exp_results_failure_rate_range",
        ),
        CheckConstraint("retry_rate >= 0.0", name="chk_exp_results_retry_rate_non_negative"),
        CheckConstraint(
            "duplicate_execution_count >= 0",
            name="chk_exp_results_duplicate_count_non_negative",
        ),
        CheckConstraint(
            "deferral_rate >= 0.0 AND deferral_rate <= 1.0",
            name="chk_exp_results_deferral_rate_range",
        ),
        CheckConstraint(
            "avg_region_utilization >= 0.0 AND avg_region_utilization <= 1.0",
            name="chk_exp_results_avg_utilization_range",
        ),
    )
