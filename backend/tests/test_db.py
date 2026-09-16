import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.db.session import check_db_connectivity, get_db_engine, close_db_connections
from app.core.config import Settings


@pytest.mark.asyncio
async def test_db_check_unconfigured(monkeypatch):
    with patch("app.db.session.get_settings", return_value=Settings(_env_file=None, DATABASE_URL=None)):
        connected, msg = await check_db_connectivity()
        assert connected is False
        assert "not configured" in msg.lower()


@pytest.mark.asyncio
async def test_db_check_successful_connection():
    mock_conn = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar.return_value = 1
    mock_conn.execute.return_value = mock_result

    mock_engine = MagicMock()
    mock_engine.connect.return_value.__aenter__.return_value = mock_conn

    with patch("app.db.session.get_settings", return_value=Settings(_env_file=None, DATABASE_URL="postgresql+asyncpg://mock/db")), \
         patch("app.db.session.get_db_engine", return_value=mock_engine):
        connected, msg = await check_db_connectivity()
        assert connected is True
        assert msg == "connected"


@pytest.mark.asyncio
async def test_db_close_connections():
    mock_engine = AsyncMock()
    with patch("app.db.session._async_engine", mock_engine):
        await close_db_connections()
        mock_engine.dispose.assert_awaited_once()
