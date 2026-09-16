from typing import Dict, Any
from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.core.config import get_settings
from app.db.session import check_db_connectivity
from app.infrastructure.redis import check_redis_connectivity

router = APIRouter(prefix="/health", tags=["Health"])


class ComponentHealth(BaseModel):
    status: str
    message: str


class HealthResponse(BaseModel):
    status: str
    environment: str
    components: Dict[str, ComponentHealth]


@router.get("", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    settings = get_settings()

    db_connected, db_msg = await check_db_connectivity()
    redis_connected, redis_msg = await check_redis_connectivity()

    db_status = "connected" if db_connected else ("unconfigured" if not settings.DATABASE_URL else "unavailable")
    redis_status = "connected" if redis_connected else ("unconfigured" if not settings.REDIS_URL else "unavailable")

    overall_status = "healthy"
    if db_status == "unavailable" or redis_status == "unavailable":
        overall_status = "degraded"

    return HealthResponse(
        status=overall_status,
        environment=settings.ENVIRONMENT,
        components={
            "api": ComponentHealth(status="healthy", message="FastAPI application is running"),
            "database": ComponentHealth(status=db_status, message=db_msg),
            "redis": ComponentHealth(status=redis_status, message=redis_msg),
        },
    )


@router.get("/live")
async def liveness_check() -> Dict[str, str]:
    return {"status": "alive"}


@router.get("/ready")
async def readiness_check(response: Response) -> Dict[str, Any]:
    settings = get_settings()
    db_connected, db_msg = await check_db_connectivity()
    redis_connected, redis_msg = await check_redis_connectivity()

    # If configured but failing, return 503
    ready = True
    if settings.DATABASE_URL and not db_connected:
        ready = False
    if settings.REDIS_URL and not redis_connected:
        ready = False

    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "ready": ready,
        "database": {"connected": db_connected, "message": db_msg},
        "redis": {"connected": redis_connected, "message": redis_msg},
    }
