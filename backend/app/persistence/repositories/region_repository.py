from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.persistence.models.region import Region
from app.persistence.repositories.base import BaseRepository


class RegionRepository(BaseRepository[Region]):
    def __init__(self, session: AsyncSession):
        super().__init__(Region, session)

    async def get_by_code(self, code: str) -> Optional[Region]:
        stmt = select(Region).where(Region.code == code)
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def list_active(self, only_available: bool = True) -> List[Region]:
        stmt = select(Region).where(Region.is_active.is_(True))
        if only_available:
            stmt = stmt.where(Region.is_available.is_(True))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
