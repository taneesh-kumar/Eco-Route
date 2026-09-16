from functools import lru_cache
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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
