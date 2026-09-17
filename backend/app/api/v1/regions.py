"""Regions API endpoints exposing regional topology and operational state."""

from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.regions import RegionResponse, RegionStateResponse
from app.carbon.service import CarbonService
from app.db.session import get_db_session
from app.domain.region import Region as DomainRegion
from app.persistence.repositories.region_repository import RegionRepository

router = APIRouter(prefix="/regions", tags=["Regions"])
_carbon_service = CarbonService()


@router.get("", response_model=List[RegionResponse])
async def list_regions(
    session: AsyncSession = Depends(get_db_session),
) -> List[RegionResponse]:
    """Lists all active cloud regions and hardware baseline specifications."""
    repo = RegionRepository(session)
    db_regions = await repo.list_active()
    return [RegionResponse.model_validate(r) for r in db_regions]


@router.get("/{region_id}/state", response_model=RegionStateResponse)
async def get_region_state(
    region_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> RegionStateResponse:
    """Retrieves real-time operational capacity, carbon intensity, and health flags."""
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

    return RegionStateResponse(
        id=db_region.id,
        code=db_region.code,
        current_utilization=db_region.current_utilization,
        carbon_intensity=carbon.value if carbon.is_trustworthy else None,
        carbon_quality=carbon.quality.value,
        network_latency_ms=db_region.network_latency_ms,
        is_available=db_region.is_available,
    )
