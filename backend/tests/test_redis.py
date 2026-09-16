import pytest
from unittest.mock import AsyncMock, patch
from app.infrastructure.redis import check_redis_connectivity, close_redis_connections
from app.core.config import Settings


@pytest.mark.asyncio
async def test_redis_check_unconfigured():
    with patch("app.infrastructure.redis.get_settings", return_value=Settings(_env_file=None, REDIS_URL=None)):
        connected, msg = await check_redis_connectivity()
        assert connected is False
        assert "not configured" in msg.lower()


@pytest.mark.asyncio
async def test_redis_check_successful_ping():
    mock_client = AsyncMock()
    mock_client.ping.return_value = True

    with patch("app.infrastructure.redis.get_settings", return_value=Settings(_env_file=None, REDIS_URL="redis://mock:6379/0")), \
         patch("app.infrastructure.redis.get_redis_client", return_value=mock_client):
        connected, msg = await check_redis_connectivity()
        assert connected is True
        assert msg == "connected"


@pytest.mark.asyncio
async def test_redis_close_connections():
    mock_client = AsyncMock()
    with patch("app.infrastructure.redis._redis_client", mock_client):
        await close_redis_connections()
        mock_client.aclose.assert_awaited_once()
