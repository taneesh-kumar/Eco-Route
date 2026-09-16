import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


@pytest_asyncio.fixture
async def db_session():
    settings = get_settings()
    if not settings.DATABASE_URL:
        pytest.skip("DATABASE_URL is not configured for persistence tests")

    engine = create_async_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
        echo=False,
    )
    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with session_factory() as session:
        yield session

    await engine.dispose()
