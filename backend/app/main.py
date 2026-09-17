import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.api.v1.health import router as health_router
from app.core.config import get_settings
from app.core.logging import logger, setup_logging
from app.db.seed import seed_default_regions
from app.db.session import close_db_connections, get_db_sessionmaker
from app.execution.deferral_evaluator import DeferredJobEvaluator
from app.execution.worker import ExecutionWorker
from app.infrastructure.redis import close_redis_connections


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    setup_logging(settings.LOG_LEVEL)
    logger.info(f"Starting EcoRoute backend in {settings.ENVIRONMENT} mode...")

    # 1. Seed cloud regions if not present
    try:
        sessionmaker = get_db_sessionmaker()
        if sessionmaker:
            async with sessionmaker() as session:
                await seed_default_regions(session)
    except Exception as exc:
        logger.error(f"Failed to verify/seed default cloud regions on startup: {exc}")

    # 2. Launch background execution worker and deferral sweep
    worker = ExecutionWorker(worker_id="backend-worker-01")
    evaluator = DeferredJobEvaluator()
    worker_task = asyncio.create_task(worker.run_loop(poll_interval=0.5))
    evaluator_task = asyncio.create_task(evaluator.run_deferral_loop(sweep_interval=3.0))

    yield

    logger.info("Shutting down EcoRoute backend...")
    worker.stop()
    evaluator.stop()
    worker_task.cancel()
    evaluator_task.cancel()
    try:
        await asyncio.gather(worker_task, evaluator_task, return_exceptions=True)
    except Exception:
        pass

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
