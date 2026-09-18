from typing import Optional, Tuple
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.core.logging import logger

_async_engine: Optional[AsyncEngine] = None
_async_sessionmaker: Optional[async_sessionmaker[AsyncSession]] = None


def get_db_engine() -> Optional[AsyncEngine]:
    global _async_engine, _async_sessionmaker
    settings = get_settings()

    if not settings.DATABASE_URL:
        return None

    if _async_engine is None:
        _async_engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            pool_pre_ping=True,
            pool_recycle=300,
        )
        _async_sessionmaker = async_sessionmaker(
            bind=_async_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    return _async_engine


def get_db_sessionmaker() -> Optional[async_sessionmaker[AsyncSession]]:
    get_db_engine()
    return _async_sessionmaker


async def get_db_session():
    sessionmaker = get_db_sessionmaker()
    if sessionmaker is None:
        raise RuntimeError("Database sessionmaker is not available.")
    async with sessionmaker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_db_connectivity() -> Tuple[bool, str]:
    """
    Non-destructive connectivity check against PostgreSQL.
    Returns (is_connected, status_message).
    """
    settings = get_settings()
    if not settings.DATABASE_URL:
        return False, "Database URL is not configured"

    engine = get_db_engine()
    if engine is None:
        return False, "Database engine could not be initialized"

    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            scalar = result.scalar()
            if scalar == 1:
                return True, "connected"
            return False, f"Unexpected response from database: {scalar}"
    except Exception as exc:
        logger.error(f"PostgreSQL connectivity check failed: {exc}")
        return False, f"Connection failed: {str(exc)}"


async def close_db_connections() -> None:
    global _async_engine, _async_sessionmaker
    if _async_engine is not None:
        logger.info("Closing PostgreSQL database connections...")
        await _async_engine.dispose()
        _async_engine = None
        _async_sessionmaker = None
