import pytest
from app.core.config import Settings, get_settings


def test_default_settings():
    settings = Settings(_env_file=None)
    assert settings.ENVIRONMENT == "development"
    assert settings.LOG_LEVEL == "INFO"
    assert settings.PORT == 8000
    assert settings.DATABASE_URL is None
    assert settings.REDIS_URL is None
    assert settings.ELECTRICITY_MAPS_API_URL == "https://api.electricitymap.org/v4"
    assert "http://localhost:3000" in settings.CORS_ORIGINS
    assert not settings.is_production


def test_custom_settings(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    monkeypatch.setenv("PORT", "9000")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@supabase.io:5432/db")
    monkeypatch.setenv("REDIS_URL", "redis://redis.cloud:6379/0")
    monkeypatch.setenv("ELECTRICITY_MAPS_API_KEY", "test-token-123")
    monkeypatch.setenv("ELECTRICITY_MAPS_API_URL", "https://custom-api.electricitymap.org/v3")

    settings = Settings(_env_file=None)
    assert settings.ENVIRONMENT == "production"
    assert settings.LOG_LEVEL == "WARNING"
    assert settings.PORT == 9000
    assert settings.DATABASE_URL == "postgresql+asyncpg://user:pass@supabase.io:5432/db"
    assert settings.REDIS_URL == "redis://redis.cloud:6379/0"
    assert settings.ELECTRICITY_MAPS_API_KEY == "test-token-123"
    assert settings.ELECTRICITY_MAPS_API_URL == "https://custom-api.electricitymap.org/v3"
    assert settings.is_production


def test_get_settings_caching():
    s1 = get_settings()
    s2 = get_settings()
    assert s1 is s2
