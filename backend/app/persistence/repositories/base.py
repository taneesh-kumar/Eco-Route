import uuid
from typing import Generic, List, Optional, Type, TypeVar
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.persistence.models.base import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType], session: AsyncSession):
        self.model = model
        self.session = session

    async def get_by_id(self, id_: uuid.UUID) -> Optional[ModelType]:
        result = await self.session.execute(
            select(self.model).where(self.model.id == id_)
        )
        return result.scalars().first()

    async def list_all(self, limit: int = 100, offset: int = 0) -> List[ModelType]:
        result = await self.session.execute(
            select(self.model).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def create(self, instance: ModelType) -> ModelType:
        self.session.add(instance)
        await self.session.flush()
        return instance

    async def delete(self, instance: ModelType) -> None:
        await self.session.delete(instance)
        await self.session.flush()
