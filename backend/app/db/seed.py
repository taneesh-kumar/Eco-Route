"""Database seeder populating global cloud regions with realistic telemetry and coordinates."""

from decimal import Decimal
import logging
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.persistence.models.region import Region

logger = logging.getLogger(__name__)

DEFAULT_REGIONS = [
    {
        "code": "se-sto",
        "name": "Sweden Central (Stockholm)",
        "provider": "AWS",
        "country": "Sweden",
        "latitude": Decimal("59.329300"),
        "longitude": Decimal("18.068600"),
        "max_cpu_capacity": Decimal("512.00"),
        "max_memory_capacity": Decimal("2048.00"),
        "current_utilization": Decimal("0.2200"),
        "performance_factor": Decimal("1.2000"),
        "idle_power_watts": Decimal("120.00"),
        "peak_power_watts": Decimal("400.00"),
        "network_latency_ms": Decimal("25.00"),
        "is_available": True,
        "is_active": True,
    },
    {
        "code": "fr-par",
        "name": "France Central (Paris)",
        "provider": "AWS",
        "country": "France",
        "latitude": Decimal("48.856600"),
        "longitude": Decimal("2.352200"),
        "max_cpu_capacity": Decimal("512.00"),
        "max_memory_capacity": Decimal("2048.00"),
        "current_utilization": Decimal("0.2800"),
        "performance_factor": Decimal("1.0000"),
        "idle_power_watts": Decimal("100.00"),
        "peak_power_watts": Decimal("450.00"),
        "network_latency_ms": Decimal("15.00"),
        "is_available": True,
        "is_active": True,
    },
    {
        "code": "de-fra",
        "name": "Germany Central (Frankfurt)",
        "provider": "GCP",
        "country": "Germany",
        "latitude": Decimal("50.110900"),
        "longitude": Decimal("8.682100"),
        "max_cpu_capacity": Decimal("1024.00"),
        "max_memory_capacity": Decimal("4096.00"),
        "current_utilization": Decimal("0.3500"),
        "performance_factor": Decimal("1.3000"),
        "idle_power_watts": Decimal("150.00"),
        "peak_power_watts": Decimal("600.00"),
        "network_latency_ms": Decimal("10.00"),
        "is_available": True,
        "is_active": True,
    },
    {
        "code": "us-east",
        "name": "US East (N. Virginia)",
        "provider": "AWS",
        "country": "USA",
        "latitude": Decimal("38.130000"),
        "longitude": Decimal("-78.450000"),
        "max_cpu_capacity": Decimal("2048.00"),
        "max_memory_capacity": Decimal("8192.00"),
        "current_utilization": Decimal("0.4200"),
        "performance_factor": Decimal("1.1000"),
        "idle_power_watts": Decimal("130.00"),
        "peak_power_watts": Decimal("550.00"),
        "network_latency_ms": Decimal("35.00"),
        "is_available": True,
        "is_active": True,
    },
    {
        "code": "pl-war",
        "name": "Poland Central (Warsaw)",
        "provider": "GCP",
        "country": "Poland",
        "latitude": Decimal("52.229700"),
        "longitude": Decimal("21.012200"),
        "max_cpu_capacity": Decimal("256.00"),
        "max_memory_capacity": Decimal("1024.00"),
        "current_utilization": Decimal("0.1800"),
        "performance_factor": Decimal("0.9000"),
        "idle_power_watts": Decimal("90.00"),
        "peak_power_watts": Decimal("380.00"),
        "network_latency_ms": Decimal("40.00"),
        "is_available": True,
        "is_active": True,
    },
    {
        "code": "jp-tyo",
        "name": "Asia Pacific (Tokyo)",
        "provider": "AWS",
        "country": "Japan",
        "latitude": Decimal("35.676200"),
        "longitude": Decimal("139.650300"),
        "max_cpu_capacity": Decimal("1024.00"),
        "max_memory_capacity": Decimal("4096.00"),
        "current_utilization": Decimal("0.3100"),
        "performance_factor": Decimal("1.1500"),
        "idle_power_watts": Decimal("110.00"),
        "peak_power_watts": Decimal("480.00"),
        "network_latency_ms": Decimal("50.00"),
        "is_available": True,
        "is_active": True,
    },
    {
        "code": "uk-lon",
        "name": "UK South (London)",
        "provider": "Azure",
        "country": "United Kingdom",
        "latitude": Decimal("51.507400"),
        "longitude": Decimal("-0.127800"),
        "max_cpu_capacity": Decimal("512.00"),
        "max_memory_capacity": Decimal("2048.00"),
        "current_utilization": Decimal("0.2600"),
        "performance_factor": Decimal("1.0500"),
        "idle_power_watts": Decimal("115.00"),
        "peak_power_watts": Decimal("460.00"),
        "network_latency_ms": Decimal("20.00"),
        "is_available": True,
        "is_active": True,
    },
]


async def seed_default_regions(session: AsyncSession) -> int:
    """Seeds default cloud regions if none exist in the database."""
    result = await session.execute(select(Region.id).limit(1))
    if result.scalars().first() is not None:
        logger.debug("Cloud regions already seeded in PostgreSQL.")
        return 0

    logger.info("Seeding default global cloud regions into PostgreSQL...")
    count = 0
    for reg_data in DEFAULT_REGIONS:
        region = Region(
            id=uuid.uuid4(),
            **reg_data,
        )
        session.add(region)
        count += 1

    await session.commit()
    logger.info(f"Successfully seeded {count} cloud regions.")
    return count
