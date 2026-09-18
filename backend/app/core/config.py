from functools import lru_cache
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # PostgreSQL / Supabase
    DATABASE_URL: Optional[str] = Field(
        default=None,
        description="PostgreSQL async connection string (postgresql+asyncpg://...)",
    )

    # Redis Cache & Locks
    REDIS_URL: Optional[str] = Field(
        default=None,
        description="Redis connection URL (redis://...)",
    )

    # Electricity Maps API
    ELECTRICITY_MAPS_API_KEY: Optional[str] = Field(
        default=None,
        description="Electricity Maps API auth token / API key",
    )
    ELECTRICITY_MAPS_API_URL: str = Field(
        default="https://api.electricitymap.org/v4",
        description="Electricity Maps API base URL",
    )
    CARBON_CACHE_MAX_AGE_SECONDS: int = Field(
        default=300,
        description="Maximum freshness window in seconds for cached carbon observations",
    )
    CARBON_FORECAST_CACHE_MAX_AGE_SECONDS: int = Field(
        default=1800,
        description="Maximum freshness window in seconds for cached carbon forecasts",
    )

    # Deferral Policy Parameters
    CARBON_DEFERRAL_MIN_RELATIVE_IMPROVEMENT: float = Field(
        default=0.15,
        description="Minimum relative carbon emissions improvement (0.15 = 15.0%) required to approve deferral",
    )
    CARBON_DEFERRAL_EPSILON: float = Field(
        default=0.0,
        description="Strict mathematical margin epsilon for Jr comparison in deferral gating",
    )

    # CORS
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000"],
        description="Allowed CORS origins",
    )

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"production", "prod"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
