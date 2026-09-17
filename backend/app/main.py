from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.api.v1.health import router as health_router
from app.core.config import get_settings
from app.core.logging import logger, setup_logging
from app.db.session import close_db_connections
from app.infrastructure.redis import close_redis_connections


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    setup_logging(settings.LOG_LEVEL)
    logger.info(f"Starting EcoRoute backend in {settings.ENVIRONMENT} mode...")

    yield

    logger.info("Shutting down EcoRoute backend...")
    await close_db_connections()
    await close_redis_connections()
    logger.info("EcoRoute backend shutdown complete.")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="EcoRoute API",
        description="Carbon-Aware Cloud Workload Scheduler API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS Configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Root health probe alias
    app.include_router(health_router)

    # API v1 Router
    app.include_router(api_router)

    # Global RFC 7807 Error Handler for unhandled exceptions
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        response = JSONResponse(
            status_code=500,
            content={
                "type": "https://errors.ecoroute.dev/internal-server-error",
                "title": "Internal Server Error",
                "status": 500,
                "detail": str(exc) if not settings.is_production else "An unexpected server error occurred.",
            },
        )
        origin = request.headers.get("origin")
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
        return response

    return app


app = create_app()
