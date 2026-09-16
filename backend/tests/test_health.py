import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import patch

from app.main import app


@pytest.mark.asyncio
async def test_liveness_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/live")
        assert response.status_code == 200
        assert response.json() == {"status": "alive"}


@pytest.mark.asyncio
async def test_health_check_unconfigured():
    # When DB and Redis are unconfigured (default in testing)
    with patch("app.api.v1.health.check_db_connectivity", return_value=(False, "Database URL is not configured")), \
         patch("app.api.v1.health.check_redis_connectivity", return_value=(False, "Redis URL is not configured")):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert data["components"]["api"]["status"] == "healthy"
            assert data["components"]["database"]["status"] == "unconfigured"
            assert data["components"]["redis"]["status"] == "unconfigured"


@pytest.mark.asyncio
async def test_health_check_all_connected():
    with patch("app.api.v1.health.check_db_connectivity", return_value=(True, "connected")), \
         patch("app.api.v1.health.check_redis_connectivity", return_value=(True, "connected")):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert data["components"]["database"]["status"] == "connected"
            assert data["components"]["redis"]["status"] == "connected"


@pytest.mark.asyncio
async def test_readiness_check_success():
    with patch("app.api.v1.health.check_db_connectivity", return_value=(True, "connected")), \
         patch("app.api.v1.health.check_redis_connectivity", return_value=(True, "connected")):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health/ready")
            assert response.status_code == 200
            assert response.json()["ready"] is True
