"""Standalone ExecutionWorker daemon process entry point.

Run via:
    uv run python -m app.execution.worker_daemon
or:
    python -m app.execution.worker_daemon
"""

import asyncio
import logging
import signal
import sys
from typing import Optional

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.session import close_db_connections
from app.execution.deferral_evaluator import DeferredJobEvaluator
from app.execution.dispatcher import ExecutionDispatcher
from app.execution.worker import ExecutionWorker
from app.infrastructure.redis import close_redis_connections

logger = logging.getLogger("ecoroute.worker_daemon")


async def run_recovery_loop(dispatcher: ExecutionDispatcher, poll_interval: float = 5.0) -> None:
    """Interval-controlled background loop recovering stale pending dispatches."""
    from app.db.session import get_db_sessionmaker
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


async def main() -> None:
    settings = get_settings()
    setup_logging(settings.LOG_LEVEL)
    logger.info(f"Starting EcoRoute standalone worker daemon in {settings.ENVIRONMENT} mode...")

    worker = ExecutionWorker(worker_id=f"standalone-worker-01")
    evaluator = DeferredJobEvaluator()
    dispatcher = ExecutionDispatcher()

    worker_task = asyncio.create_task(worker.run_loop(poll_interval=0.5))
    evaluator_task = asyncio.create_task(evaluator.run_deferral_loop(sweep_interval=3.0))
    recovery_task = asyncio.create_task(run_recovery_loop(dispatcher, poll_interval=5.0))

    stop_event = asyncio.Event()

    def handle_signal():
        logger.info("Received termination signal. Initiating graceful shutdown...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            # Signal handlers not implemented on Windows event loops
            pass

    try:
        await stop_event.wait()
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        logger.info("Shutting down worker daemon tasks...")
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
        logger.info("EcoRoute worker daemon shutdown cleanly complete.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
