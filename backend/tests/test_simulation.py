"""Unit and integration tests for Simulation and Benchmarking (Phase 7)."""

from datetime import datetime, timezone
from decimal import Decimal
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db_session
from app.main import app
from app.persistence.models.enums import SchedulerVariant
from app.persistence.models.experiment import Experiment, ExperimentResult
from app.simulation.experiment_engine import ExperimentEngine
from app.simulation.region_perturbator import RegionPerturbator
from app.simulation.simulation_runtime import SimulationRuntime
from app.simulation.workload_generator import WorkloadGenerator


def test_workload_generator_determinism():
    """Verify identical seeds produce byte-identical synthetic workload populations."""
    base_time = datetime(2026, 9, 17, 12, 0, 0, tzinfo=timezone.utc)
    pop1 = WorkloadGenerator.generate_population(count=20, seed=42, base_time=base_time)
    pop2 = WorkloadGenerator.generate_population(count=20, seed=42, base_time=base_time)

    assert len(pop1) == 20
    assert len(pop2) == 20

    for w1, w2 in zip(pop1, pop2):
        assert w1.workload_name == w2.workload_name
        assert w1.workload_type == w2.workload_type
        assert w1.demand.cpu_demand == w2.demand.cpu_demand
        assert w1.demand.memory_demand == w2.demand.memory_demand
        assert w1.demand.base_execution_duration == w2.demand.base_execution_duration
        assert w1.priority == w2.priority
        assert w1.deadline == w2.deadline


def test_workload_generator_archetype_diversity():
    """Verify generated workload population contains all required archetypes."""
    base_time = datetime(2026, 9, 17, 12, 0, 0, tzinfo=timezone.utc)
    pop = WorkloadGenerator.generate_population(count=30, seed=123, base_time=base_time)
    archetypes = {w.workload_type.value for w in pop}
    assert "BATCH" in archetypes
    assert "INFERENCE" in archetypes
    assert "TRAINING" in archetypes


def test_region_scenario_cloning_isolation():
    """Verify mutations on a cloned scenario do not leak into the original baseline."""
    base_scenario = RegionPerturbator.create_baseline_scenario(seed=42)
    first_reg = base_scenario.regions[0]
    original_ci = base_scenario.carbon_map[first_reg.id].value
    original_util = first_reg.current_utilization

    clone = base_scenario.clone()
    clone_reg = clone.regions[0]
    from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
    clone.carbon_map[clone_reg.id] = CarbonIntensity(
        quality=CarbonQuality.LIVE,
        source=CarbonSource.ELECTRICITY_MAPS,
        value=Decimal("999.99"),
    )
    clone_reg.current_utilization = Decimal("0.99")

    # Original should be unmodified
    assert base_scenario.carbon_map[first_reg.id].value == original_ci
    assert base_scenario.carbon_map[first_reg.id].value != Decimal("999.99")
    assert first_reg.current_utilization == original_util
    assert first_reg.current_utilization != Decimal("0.99")


@pytest.mark.asyncio
async def test_simulation_runtime_five_variants():
    """Verify SimulationRuntime evaluates all 5 variants with zero duplicate executions."""
    runtime = SimulationRuntime()
    now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=timezone.utc)
    workloads = WorkloadGenerator.generate_population(count=10, seed=42, base_time=now)

    for strat in [
        SchedulerVariant.ECOROUTE,
        SchedulerVariant.CONVENTIONAL,
        SchedulerVariant.CARBON_ONLY,
        SchedulerVariant.PERFORMANCE_ONLY,
        SchedulerVariant.RANDOM,
    ]:
        scenario = RegionPerturbator.create_baseline_scenario(seed=42)
        result = await runtime.run_strategy(
            strategy=strat,
            workloads=workloads,
            scenario=scenario,
            base_time=now,
        )

        assert result.scheduler_algorithm == strat.value
        assert result.duplicate_execution_count == 0
        assert result.total_energy_kwh >= Decimal("0")
        assert result.avg_latency_ms >= Decimal("0")
        assert result.deadline_compliance_rate >= Decimal("0")


@pytest.mark.asyncio
async def test_experiment_engine_benchmark_execution():
    """Verify ExperimentEngine executes full 5-variant benchmark and records counterfactual metrics."""
    engine = ExperimentEngine()
    experiment, results = await engine.run_benchmark(
        name="Scientific Benchmark Validation",
        workload_count=15,
        random_seed=42,
    )

    assert experiment.name == "Scientific Benchmark Validation"
    assert experiment.status == "COMPLETED"
    assert len(results) == 5

    algorithms = {r.scheduler_algorithm for r in results}
    expected = {
        SchedulerVariant.ECOROUTE.value,
        SchedulerVariant.CONVENTIONAL.value,
        SchedulerVariant.CARBON_ONLY.value,
        SchedulerVariant.PERFORMANCE_ONLY.value,
        SchedulerVariant.RANDOM.value,
    }
    assert algorithms == expected

    # Verify EcoRoute has counterfactual metrics relative to Conventional
    ecoroute_res = next(r for r in results if r.scheduler_algorithm == SchedulerVariant.ECOROUTE.value)
    assert "carbon_reduction_pct_vs_conventional" in ecoroute_res.detailed_metrics
    assert ecoroute_res.duplicate_execution_count == 0


@pytest.mark.asyncio
async def test_experiment_api_endpoints():
    """Verify API endpoints for experiment creation, listing, and results retrieval."""
    mock_session = AsyncMock()
    mock_session.add = MagicMock()  # session.add is synchronous in SQLAlchemy AsyncSession

    async def override_get_db():
        yield mock_session

    app.dependency_overrides[get_db_session] = override_get_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Trigger benchmark POST
            payload = {
                "name": "Integration Test Benchmark",
                "scenario_type": "DEFAULT_GLOBAL_TOPOLOGY",
                "workload_count": 10,
                "random_seed": 99,
            }
            res = await client.post("/api/v1/experiments", json=payload)
            assert res.status_code == 201
            data = res.json()
            assert data["name"] == "Integration Test Benchmark"
            exp_id = data["id"]

            # 2. Get experiment detail GET
            mock_experiment = MagicMock()
            mock_experiment.id = uuid.UUID(exp_id)
            mock_experiment.name = "Integration Test Benchmark"
            mock_experiment.scheduler_variant = "ECOROUTE"
            mock_experiment.random_seed = 99
            mock_experiment.scenario_type = "DEFAULT_GLOBAL_TOPOLOGY"
            mock_experiment.status = "COMPLETED"
            mock_experiment.started_at = datetime.now(timezone.utc)
            mock_experiment.completed_at = datetime.now(timezone.utc)
            mock_experiment.created_at = datetime.now(timezone.utc)

            mock_query_res = MagicMock()
            mock_query_res.scalars.return_value.first.return_value = mock_experiment
            mock_session.execute.return_value = mock_query_res

            get_res = await client.get(f"/api/v1/experiments/{exp_id}")
            assert get_res.status_code == 200
            assert get_res.json()["id"] == exp_id

            # 3. Get experiment results GET
            mock_result_record = MagicMock()
            mock_result_record.id = uuid.uuid4()
            mock_result_record.experiment_id = uuid.UUID(exp_id)
            mock_result_record.scheduler_algorithm = "ECOROUTE"
            mock_result_record.total_energy_kwh = Decimal("12.5")
            mock_result_record.total_co2eq_grams = Decimal("150.0")
            mock_result_record.avg_execution_time_seconds = Decimal("60.0")
            mock_result_record.avg_latency_ms = Decimal("45.0")
            mock_result_record.deadline_compliance_rate = Decimal("1.0")
            mock_result_record.failure_rate = Decimal("0.0")
            mock_result_record.retry_rate = Decimal("0.0")
            mock_result_record.duplicate_execution_count = 0
            mock_result_record.deferral_rate = Decimal("0.1")
            mock_result_record.avg_region_utilization = Decimal("0.55")
            mock_result_record.detailed_metrics = {"carbon_reduction_pct_vs_conventional": 25.4}

            mock_results_res = MagicMock()
            mock_results_res.scalars.return_value.first.return_value = mock_experiment
            mock_results_res.scalars.return_value.all.return_value = [mock_result_record]
            mock_session.execute.return_value = mock_results_res

            results_res = await client.get(f"/api/v1/experiments/{exp_id}/results")
            assert results_res.status_code == 200
            results_data = results_res.json()
            assert len(results_data) >= 1
            assert results_data[0]["scheduler_algorithm"] == "ECOROUTE"
            assert results_data[0]["duplicate_execution_count"] == 0

    finally:
        app.dependency_overrides.clear()
