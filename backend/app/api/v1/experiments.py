"""API Router for Scientific Simulation Experiments and Multi-Scheduler Benchmarks."""

from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.experiments import (
    ExperimentCreate,
    ExperimentResponse,
    ExperimentResultResponse,
)
from app.db.session import get_db_session
from app.persistence.models.experiment import Experiment, ExperimentResult
from app.simulation.experiment_engine import ExperimentEngine

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.post(
    "",
    response_model=ExperimentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Execute multi-strategy academic benchmark",
)
async def create_experiment(
    payload: ExperimentCreate,
    session: AsyncSession = Depends(get_db_session),
) -> ExperimentResponse:
    """Runs a controlled deterministic benchmark across all 5 scheduler variants.

    Evaluates:
    - ECOROUTE (Multi-objective optimization)
    - CONVENTIONAL (Performance + cost baseline)
    - CARBON_ONLY (Greedy lowest carbon intensity)
    - PERFORMANCE_ONLY (Greedy lowest latency)
    - RANDOM (Uniform stochastic baseline)
    """
    engine = ExperimentEngine()
    experiment, _ = await engine.run_benchmark(
        name=payload.name,
        scenario_type=payload.scenario_type,
        workload_count=payload.workload_count,
        random_seed=payload.random_seed,
        session=session,
    )
    await session.commit()
    await session.refresh(experiment)
    return ExperimentResponse.model_validate(experiment)


@router.get(
    "",
    response_model=List[ExperimentResponse],
    summary="List simulation experiments",
)
async def list_experiments(
    limit: int = Query(50, ge=1, le=100),
    session: AsyncSession = Depends(get_db_session),
) -> List[ExperimentResponse]:
    """Retrieves all past benchmark experiments ordered by creation timestamp."""
    stmt = select(Experiment).order_by(desc(Experiment.created_at)).limit(limit)
    result = await session.execute(stmt)
    records = result.scalars().all()
    return [ExperimentResponse.model_validate(r) for r in records]


@router.get(
    "/{experiment_id}",
    response_model=ExperimentResponse,
    summary="Get experiment details",
)
async def get_experiment(
    experiment_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> ExperimentResponse:
    """Retrieves metadata and status for a specific benchmark experiment."""
    stmt = select(Experiment).where(Experiment.id == experiment_id)
    result = await session.execute(stmt)
    experiment = result.scalars().first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Experiment with ID '{experiment_id}' not found.",
        )
    return ExperimentResponse.model_validate(experiment)


@router.get(
    "/{experiment_id}/results",
    response_model=List[ExperimentResultResponse],
    summary="Get experiment strategy comparison results",
)
async def get_experiment_results(
    experiment_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> List[ExperimentResultResponse]:
    """Retrieves quantitative performance metrics for all scheduler variants in the experiment."""
    # Verify experiment exists
    exp_stmt = select(Experiment).where(Experiment.id == experiment_id)
    exp_res = await session.execute(exp_stmt)
    if not exp_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Experiment with ID '{experiment_id}' not found.",
        )

    stmt = (
        select(ExperimentResult)
        .where(ExperimentResult.experiment_id == experiment_id)
        .order_by(ExperimentResult.scheduler_algorithm)
    )
    result = await session.execute(stmt)
    results = result.scalars().all()
    return [ExperimentResultResponse.model_validate(r) for r in results]
