import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, TYPE_CHECKING
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.persistence.models.base import Base

if TYPE_CHECKING:
    from app.persistence.models.job_attempt import JobAttempt
    from app.persistence.models.carbon_observation import CarbonObservation
    from app.persistence.models.scheduling_decision import SchedulingDecision


class Region(Base):
    __tablename__ = "regions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    electricity_maps_zone: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="",
    )
    provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    country: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    latitude: Mapped[Decimal] = mapped_column(
        Numeric(9, 6),
        nullable=False,
    )
    longitude: Mapped[Decimal] = mapped_column(
        Numeric(9, 6),
        nullable=False,
    )
    max_cpu_capacity: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    max_memory_capacity: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    current_utilization: Mapped[Decimal] = mapped_column(
        Numeric(5, 4),
        nullable=False,
        default=Decimal("0.0"),
    )
    performance_factor: Mapped[Decimal] = mapped_column(
        Numeric(6, 4),
        nullable=False,
        default=Decimal("1.0"),
    )
    idle_power_watts: Mapped[Decimal] = mapped_column(
        Numeric(8, 2),
        nullable=False,
    )
    peak_power_watts: Mapped[Decimal] = mapped_column(
        Numeric(8, 2),
        nullable=False,
    )
    network_latency_ms: Mapped[Decimal] = mapped_column(
        Numeric(8, 2),
        nullable=False,
        default=Decimal("0.0"),
    )
    is_available: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
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
        back_populates="region",
    )
    carbon_observations: Mapped[List["CarbonObservation"]] = relationship(
        "CarbonObservation",
        back_populates="region",
        cascade="all, delete-orphan",
    )
    scheduling_decisions: Mapped[List["SchedulingDecision"]] = relationship(
        "SchedulingDecision",
        back_populates="selected_region",
        foreign_keys="[SchedulingDecision.selected_region_id]",
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("current_utilization", Decimal("0.0"))
        kwargs.setdefault("performance_factor", Decimal("1.0"))
        kwargs.setdefault("network_latency_ms", Decimal("0.0"))
        kwargs.setdefault("is_available", True)
        kwargs.setdefault("is_active", True)
        super().__init__(**kwargs)

    __table_args__ = (
        CheckConstraint("max_cpu_capacity > 0", name="chk_regions_max_cpu_capacity_positive"),
        CheckConstraint("max_memory_capacity > 0", name="chk_regions_max_memory_capacity_positive"),
        CheckConstraint(
            "current_utilization >= 0.0 AND current_utilization <= 1.0",
            name="chk_regions_current_utilization_range",
        ),
        CheckConstraint("performance_factor > 0", name="chk_regions_performance_factor_positive"),
        CheckConstraint("idle_power_watts >= 0", name="chk_regions_idle_power_non_negative"),
        CheckConstraint(
            "peak_power_watts >= idle_power_watts",
            name="chk_regions_peak_power_gte_idle",
        ),
        CheckConstraint("network_latency_ms >= 0", name="chk_regions_network_latency_non_negative"),
        Index("ix_regions_availability", "is_available", "is_active"),
    )
