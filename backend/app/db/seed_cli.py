"""CLI script to seed canonical cloud regions and perform optional Electricity Maps zone verification."""

import asyncio
import logging
import sys

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.seed import seed_default_regions, DEFAULT_REGIONS
from app.db.session import get_db_sessionmaker, close_db_connections

logger = logging.getLogger("ecoroute.seed_cli")


async def run_seed(verify_zones: bool = True) -> int:
    settings = get_settings()
    setup_logging(settings.LOG_LEVEL)
    logger.info(f"Running EcoRoute cloud region seeder in {settings.ENVIRONMENT} mode...")

    sessionmaker = get_db_sessionmaker()
    if not sessionmaker:
        logger.error("DATABASE_URL is not configured. Cannot seed cloud regions.")
        return 1

    async with sessionmaker() as session:
        try:
            count = await seed_default_regions(session)
            logger.info(f"Database region seeding complete. ({count} regions created/updated).")
        except Exception as exc:
            logger.error(f"Error seeding default regions: {exc}", exc_info=True)
            return 1

    if verify_zones:
        try:
            from app.carbon.client import ElectricityMapsClient
            em_client = ElectricityMapsClient()
            if em_client.is_configured:
                zones_to_verify = list(dict.fromkeys(r["electricity_maps_zone"] for r in DEFAULT_REGIONS if r.get("electricity_maps_zone")))
                logger.info(f"Validating {len(zones_to_verify)} Electricity Maps zones against live API...")
                await em_client.validate_all_configured_zones(zones_to_verify)
                logger.info("All configured Electricity Maps zones verified successfully.")
            else:
                logger.info("Electricity Maps API key not configured. Skipping zone validation.")
        except Exception as exc:
            logger.warning(f"Zone validation warning: {exc}")

    await close_db_connections()
    return 0


if __name__ == "__main__":
    verify = "--no-verify-zones" not in sys.argv
    exit_code = asyncio.run(run_seed(verify_zones=verify))
    sys.exit(exit_code)
