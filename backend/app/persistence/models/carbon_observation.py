import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, TYPE_CHECKING
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    desc,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.persistence.models.base import Base

if TYPE_CHECKING:
    from app.persistence.models.region import Region


class CarbonObservation(Base):
    __tablename__ = "carbon_observations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    region_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("regions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    carbon_intensity: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(8, 2),
        nullable=True,
    )
    source: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    data_quality: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    observation_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    received_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    valid_until: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    region: Mapped["Region"] = relationship(
        "Region",
        back_populates="carbon_observations",
    )

    __table_args__ = (
        CheckConstraint(
            "(data_quality = 'UNAVAILABLE' AND carbon_intensity IS NULL) OR "
            "(data_quality != 'UNAVAILABLE' AND carbon_intensity IS NOT NULL)",
            name="chk_carbon_obs_zero_fabrication",
        ),
        CheckConstraint(
            "carbon_intensity IS NULL OR carbon_intensity >= 0",
            name="chk_carbon_intensity_non_negative",
        ),
        CheckConstraint(
            "data_quality IN ('LIVE', 'CACHED', 'UNAVAILABLE')",
            name="chk_carbon_obs_valid_quality",
        ),
        CheckConstraint(
            "source IN ('ELECTRICITY_MAPS', 'REGIONAL_PROFILE')",
            name="chk_carbon_obs_valid_source",
        ),
        CheckConstraint(
            "valid_until >= observation_timestamp",
            name="chk_carbon_obs_valid_until_gte_obs",
        ),
        Index("ix_carbon_observations_region_time", "region_id", desc("observation_timestamp")),
    )
