"""Unit tests for ElectricityMapsClient, CarbonCache, and CarbonService."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import pytest

from app.carbon.cache import CarbonCache
from app.carbon.client import (
    CarbonAuthenticationError,
    CarbonProviderUnavailableError,
    CarbonRateLimitError,
    ElectricityMapsClient,
)
from app.carbon.service import CarbonService
from app.domain.carbon import CarbonQuality
from app.domain.region import Region


class TestElectricityMapsClient:
    """Test ElectricityMapsClient HTTP parsing, authentication, and error handling."""

    @pytest.mark.asyncio
    async def test_successful_live_response(self):
        client = ElectricityMapsClient(api_key="test-key-123")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "zone": "US-CAL-CISO",
            "carbonIntensity": 185.5,
            "datetime": "2026-09-17T12:00:00Z",
        }

        with patch("httpx.AsyncClient.get", return_value=mock_response):
            result = await client.get_latest_carbon_intensity("US-CAL-CISO")
            assert result.carbon_intensity == Decimal("185.5")
            assert result.zone == "US-CAL-CISO"
            assert result.valid_until > result.observation_timestamp

    @pytest.mark.asyncio
    async def test_auth_error_401(self):
        client = ElectricityMapsClient(api_key="bad-key")
        mock_response = MagicMock()
        mock_response.status_code = 401
        with patch("httpx.AsyncClient.get", return_value=mock_response):
            with pytest.raises(CarbonAuthenticationError):
                await client.get_latest_carbon_intensity("US-CAL-CISO")

    @pytest.mark.asyncio
    async def test_rate_limit_429(self):
        client = ElectricityMapsClient(api_key="test-key")
        mock_response = MagicMock()
        mock_response.status_code = 429
        with patch("httpx.AsyncClient.get", return_value=mock_response):
            with pytest.raises(CarbonRateLimitError):
                await client.get_latest_carbon_intensity("US-CAL-CISO")

    @pytest.mark.asyncio
    async def test_server_error_500(self):
        client = ElectricityMapsClient(api_key="test-key")
        mock_response = MagicMock()
        mock_response.status_code = 500
        with patch("httpx.AsyncClient.get", return_value=mock_response):
            with pytest.raises(CarbonProviderUnavailableError):
                await client.get_latest_carbon_intensity("US-CAL-CISO")


class TestCarbonServiceFallback:
    """Test CarbonService fallback hierarchy and zero carbon fabrication."""

    @pytest.fixture
    def sample_region(self):
        return Region(
            code="us-west-1",
            name="US West (N. California)",
            provider="AWS",
            max_cpu_capacity=Decimal("32.0"),
            max_memory_capacity=Decimal("128.0"),
        )

    @pytest.mark.asyncio
    async def test_cache_hit_returns_valid_cache(self, sample_region):
        cache = CarbonCache()
        now = datetime.now(timezone.utc)
        cached_mock = AsyncMock()
        cached_mock.is_fresh = True
        cached_mock.carbon_intensity = Decimal("140.0")
        cached_mock.source.value = "ELECTRICITY_MAPS"

        with patch.object(cache, "get", return_value=cached_mock):
            service = CarbonService(cache=cache)
            carbon = await service.get_carbon_intensity(sample_region)
            assert carbon.quality == CarbonQuality.VALID_CACHE
            assert carbon.value == Decimal("140.0")

    @pytest.mark.asyncio
    async def test_external_failure_triggers_unavailable_zero_fabrication(self, sample_region):
        cache = CarbonCache()
        client = ElectricityMapsClient(api_key="test-key")

        # Mock cache miss
        with patch.object(cache, "get", return_value=None):
            # Mock external API failure
            with patch.object(client, "get_latest_carbon_intensity", side_effect=CarbonProviderUnavailableError("Outage")):
                service = CarbonService(client=client, cache=cache)
                carbon = await service.get_carbon_intensity(sample_region)

                # Zero fabrication check: UNAVAILABLE with intensity None
                assert carbon.quality == CarbonQuality.UNAVAILABLE
                assert carbon.value is None
                assert carbon.is_trustworthy is False
