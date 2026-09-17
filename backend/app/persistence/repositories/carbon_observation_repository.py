"""Repository for persisting and querying CarbonObservation records in PostgreSQL."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.persistence.models.carbon_observation import CarbonObservation
from app.persistence.repositories.base import BaseRepository


class CarbonObservationRepository(BaseRepository[CarbonObservation]):
    """Repository managing durable persistence for carbon intensity observations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(CarbonObservation, session)

    async def get_latest_for_region(self, region_id: uuid.UUID) -> Optional[CarbonObservation]:
        """Retrieves the most recent carbon observation recorded for a given region."""
        stmt = (
            select(CarbonObservation)
            .where(CarbonObservation.region_id == region_id)
            .order_by(desc(CarbonObservation.observation_timestamp))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def record_observation(
        self,
        region_id: uuid.UUID,
        source: str,
        data_quality: str,
        observation_timestamp: datetime,
        valid_until: datetime,
        carbon_intensity: Optional[Decimal] = None,
    ) -> CarbonObservation:
        """Persists a new carbon observation ensuring zero-fabrication check constraints."""
        obs = CarbonObservation(
            id=uuid.uuid4(),
            region_id=region_id,
            carbon_intensity=carbon_intensity,
            source=source,
            data_quality=data_quality,
            observation_timestamp=observation_timestamp,
            valid_until=valid_until,
            received_timestamp=datetime.now(timezone.utc),
            recorded_at=datetime.now(timezone.utc),
        )
        self.session.add(obs)
        await self.session.flush()
        await self.session.refresh(obs)
        return obs
