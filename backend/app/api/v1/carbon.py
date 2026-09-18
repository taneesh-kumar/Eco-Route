"""Carbon API endpoints for grid carbon observation inspection."""

from datetime import datetime, timezone
from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.carbon import CarbonObservationResponse
from app.carbon.service import CarbonService
from app.db.session import get_db_session
from app.domain.region import Region as DomainRegion
from app.persistence.repositories.region_repository import RegionRepository

router = APIRouter(prefix="/carbon", tags=["Carbon"])
_carbon_service = CarbonService()


@router.get("/regions/{region_id}/current", response_model=CarbonObservationResponse)
async def get_current_carbon(
    region_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> CarbonObservationResponse:
    """Retrieves current carbon intensity with zero-fabrication quality flags."""
    repo = RegionRepository(session)
    db_region = await repo.get_by_id(region_id)
    if db_region is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Region '{region_id}' not found.",
        )

    domain_region = DomainRegion(
        id=db_region.id,
        code=db_region.code,
        name=db_region.name,
        provider=db_region.provider,
        max_cpu_capacity=db_region.max_cpu_capacity,
        max_memory_capacity=db_region.max_memory_capacity,
        current_utilization=db_region.current_utilization,
        performance_factor=db_region.performance_factor,
        idle_power_watts=db_region.idle_power_watts,
        peak_power_watts=db_region.peak_power_watts,
        network_latency_ms=db_region.network_latency_ms,
        is_available=db_region.is_available,
        is_active=db_region.is_active,
    )

    carbon = await _carbon_service.get_carbon_intensity(domain_region, session=session)

    return CarbonObservationResponse(
        region_id=db_region.id,
        region_code=db_region.code,
        carbon_intensity=carbon.value if carbon.is_trustworthy else None,
        data_quality=carbon.quality.value,
        source=carbon.source.value,
        is_trustworthy=carbon.is_trustworthy,
        observation_timestamp=datetime.now(timezone.utc),
    )


import asyncio

@router.get("/latest", response_model=List[CarbonObservationResponse])
async def get_latest_carbon_all_regions(
    region_code: str = None,
    session: AsyncSession = Depends(get_db_session),
) -> List[CarbonObservationResponse]:
    """Retrieves latest carbon intensity across all active regions concurrently."""
    repo = RegionRepository(session)
    active_regions = await repo.list_active()
    now = datetime.now(timezone.utc)

    if region_code:
        active_regions = [r for r in active_regions if r.code == region_code]

    async def _fetch_region_carbon(db_region) -> CarbonObservationResponse:
        domain_region = DomainRegion(
            id=db_region.id,
            code=db_region.code,
            name=db_region.name,
            provider=db_region.provider,
            max_cpu_capacity=db_region.max_cpu_capacity,
            max_memory_capacity=db_region.max_memory_capacity,
            current_utilization=db_region.current_utilization,
            performance_factor=db_region.performance_factor,
            idle_power_watts=db_region.idle_power_watts,
            peak_power_watts=db_region.peak_power_watts,
            network_latency_ms=db_region.network_latency_ms,
            is_available=db_region.is_available,
            is_active=db_region.is_active,
            electricity_maps_zone=getattr(db_region, "electricity_maps_zone", None),
        )
        try:
            carbon = await _carbon_service.get_carbon_intensity(domain_region, session=session)
            return CarbonObservationResponse(
                region_id=db_region.id,
                region_code=db_region.code,
                carbon_intensity=carbon.value if carbon.is_trustworthy else None,
                data_quality=carbon.quality.value,
                source=carbon.source.value,
                is_trustworthy=carbon.is_trustworthy,
                observation_timestamp=now,
            )
        except Exception:
            return CarbonObservationResponse(
                region_id=db_region.id,
                region_code=db_region.code,
                carbon_intensity=None,
                data_quality="UNAVAILABLE",
                source="UNAVAILABLE",
                is_trustworthy=False,
                observation_timestamp=now,
            )

    results = await asyncio.gather(*[_fetch_region_carbon(r) for r in active_regions])
    return list(results)
