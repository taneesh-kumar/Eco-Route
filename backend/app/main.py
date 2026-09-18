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
from app.execution.dispatcher import ExecutionDispatcher
from app.execution.worker import ExecutionWorker
from app.infrastructure.redis import close_redis_connections


async def run_recovery_loop(dispatcher: ExecutionDispatcher, poll_interval: float = 5.0) -> None:
    """Interval-controlled background loop calling recover_pending_dispatches."""
    logger.info("Starting ExecutionDispatcher background recovery loop...")
    while True:
        try:
            sessionmaker = get_db_sessionmaker()
            if sessionmaker:
                async with sessionmaker() as session:
                    recovered = await dispatcher.recover_pending_dispatches(session=session, older_than_seconds=5)
                    if recovered > 0:
                        await session.commit()
                        logger.info(f"Recovery loop re-enqueued {recovered} stale PENDING attempt(s).")
            await asyncio.sleep(poll_interval)
        except asyncio.CancelledError:
            logger.info("Recovery loop cancelled.")
            break
        except Exception as exc:
            logger.error(f"Error in execution dispatcher recovery loop: {exc}")
            await asyncio.sleep(poll_interval)


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

    # 1b. Validate configured Electricity Maps zones (Critical Rule #4)
    try:
        from app.carbon.client import ElectricityMapsClient
        from app.db.seed import DEFAULT_REGIONS
        em_client = ElectricityMapsClient()
        if em_client.is_configured:
            zones_to_verify = list(dict.fromkeys(r["electricity_maps_zone"] for r in DEFAULT_REGIONS if r.get("electricity_maps_zone")))
            await em_client.validate_all_configured_zones(zones_to_verify)
    except Exception as exc:
        logger.error(f"Startup zone validation failed: {exc}")

    # 2. Launch background execution worker, deferral sweep, and dispatcher recovery loop
    worker = ExecutionWorker(worker_id="backend-worker-01")
    evaluator = DeferredJobEvaluator()
    dispatcher = ExecutionDispatcher()

    worker_task = asyncio.create_task(worker.run_loop(poll_interval=0.5))
    evaluator_task = asyncio.create_task(evaluator.run_deferral_loop(sweep_interval=3.0))
    recovery_task = asyncio.create_task(run_recovery_loop(dispatcher, poll_interval=5.0))

    yield

    logger.info("Shutting down EcoRoute backend...")
    worker.stop()
    evaluator.stop()
    worker_task.cancel()
    evaluator_task.cancel()
    recovery_task.cancel()
    try:
        await asyncio.gather(worker_task, evaluator_task, recovery_task, return_exceptions=True)
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
