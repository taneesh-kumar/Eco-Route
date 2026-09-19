import json
from functools import lru_cache
from typing import List, Optional, Union
from pydantic import Field, field_validator
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

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_database_url(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        v = v.strip()
        if not v:
            return None
        if v.startswith("postgres://"):
            return "postgresql+asyncpg://" + v[len("postgres://"):]
        if v.startswith("postgresql://") and not v.startswith("postgresql+"):
            return "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

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
        description=(
            "Minimum relative carbon emissions improvement (0.15 = 15.0%) required to approve deferral "
            "(Unit: fractional ratio [0.0 - 1.0]). Rationale: Workloads only defer execution if a future "
            "forecast point provides at least 15% lower carbon emissions than immediate execution (E_future < E_current * 0.85), "
            "avoiding unnecessary queueing latency for marginal carbon differences."
        ),
    )
    CARBON_DEFERRAL_EPSILON: float = Field(
        default=0.0,
        description="Strict mathematical margin epsilon for Jr comparison in deferral gating",
    )

    # CORS
    CORS_ORIGINS: Union[List[str], str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
        description="Allowed CORS origins (accepts list, JSON string, or comma-separated string)",
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        elif isinstance(v, (list, tuple, set)):
            return [str(item).strip() for item in v if str(item).strip()]
        return v

    # Worker Lifespan Mode
    RUN_EMBEDDED_WORKER: bool = Field(
        default=True,
        description="Whether to run the embedded ExecutionWorker and background loops inside FastAPI lifespan",
    )

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"production", "prod"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
