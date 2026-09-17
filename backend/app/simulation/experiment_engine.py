"""ExperimentEngine coordinating multi-strategy academic benchmarks and counterfactual metrics."""

from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import List, Optional, Tuple
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.persistence.models.enums import ExperimentStatus, SchedulerVariant
from app.persistence.models.experiment import Experiment, ExperimentResult
from app.scheduling.engine import DecisionEngine
from app.simulation.region_perturbator import RegionPerturbator
from app.simulation.simulation_runtime import SimulationRuntime, StrategyBenchmarkResult
from app.simulation.workload_generator import WorkloadGenerator

logger = logging.getLogger(__name__)


class ExperimentEngine:
    """Orchestrates scientific benchmark comparison across the 5 scheduler variants.

    Invariants:
    - All 5 strategies evaluate identical cloned scenario instances.
    - Deterministic random seed controls synthetic generation.
    - Zero network or queue timing interference.
    - Counterfactual carbon reduction % calculated directly against Conventional baseline.
    - Results durably persisted to `experiments` and `experiment_results`.
    """

    def __init__(self, decision_engine: Optional[DecisionEngine] = None):
        self.decision_engine = decision_engine or DecisionEngine()
        self.runtime = SimulationRuntime(self.decision_engine)

    async def run_benchmark(
        self,
        name: str,
        scenario_type: str = "DEFAULT_GLOBAL_TOPOLOGY",
        workload_count: int = 50,
        random_seed: int = 42,
        session: Optional[AsyncSession] = None,
    ) -> Tuple[Experiment, List[StrategyBenchmarkResult]]:
        """Executes a controlled benchmark across all 5 strategies on cloned scenarios."""
        now = datetime.now(timezone.utc)
        exp_id = uuid.uuid4()

        # 1. Generate base workload population using explicit seed
        workloads = WorkloadGenerator.generate_population(
            count=workload_count,
            seed=random_seed,
            base_time=now,
        )

        # 2. Generate baseline regional scenario
        base_scenario = RegionPerturbator.create_baseline_scenario(seed=random_seed)

        # 3. Create durable Experiment model
        experiment = Experiment(
            id=exp_id,
            name=name,
            scheduler_variant=SchedulerVariant.ECOROUTE.value,
            random_seed=random_seed,
            scenario_type=scenario_type,
            workload_configuration={
                "count": workload_count,
                "archetypes": ["BATCH", "INFERENCE", "TRAINING"],
            },
            region_configuration={
                "region_count": len(base_scenario.regions),
                "region_codes": [r.code for r in base_scenario.regions],
            },
            status=ExperimentStatus.RUNNING.value,
            started_at=now,
            created_at=now,
        )
        if session is not None:
            session.add(experiment)
            await session.flush()

        strategies = [
            SchedulerVariant.ECOROUTE,
            SchedulerVariant.CONVENTIONAL,
            SchedulerVariant.CARBON_ONLY,
            SchedulerVariant.PERFORMANCE_ONLY,
            SchedulerVariant.RANDOM,
        ]

        benchmark_results: List[StrategyBenchmarkResult] = []

        # 4. Evaluate each strategy on an isolated cloned scenario
        for strat in strategies:
            # Clone scenario so no state mutation leaks across strategies
            cloned_scenario = base_scenario.clone()
            # Clone workloads
            cloned_workloads = WorkloadGenerator.generate_population(
                count=workload_count,
                seed=random_seed,
                base_time=now,
            )

            logger.info(f"Running benchmark evaluation for strategy '{strat.value}'...")
            res = await self.runtime.run_strategy(
                strategy=strat,
                workloads=cloned_workloads,
                scenario=cloned_scenario,
                base_time=now,
                random_seed=random_seed,
            )
            benchmark_results.append(res)

        # 5. Calculate Counterfactual Carbon Reduction vs Conventional
        results_by_strat = {r.scheduler_algorithm: r for r in benchmark_results}
        conv_res = results_by_strat.get(SchedulerVariant.CONVENTIONAL.value)
        eco_res = results_by_strat.get(SchedulerVariant.ECOROUTE.value)

        carbon_reduction_pct: Optional[Decimal] = None
        if conv_res and eco_res and conv_res.total_co2eq_grams > Decimal("0"):
            diff = conv_res.total_co2eq_grams - eco_res.total_co2eq_grams
            carbon_reduction_pct = ((diff / conv_res.total_co2eq_grams) * Decimal("100")).quantize(
                Decimal("0.01")
            )
            eco_res.detailed_metrics["carbon_reduction_pct_vs_conventional"] = float(carbon_reduction_pct)

        # 6. Complete and persist experiment
        completion_time = datetime.now(timezone.utc)
        experiment.status = ExperimentStatus.COMPLETED.value
        experiment.completed_at = completion_time

        if session is not None:
            for b_res in benchmark_results:
                exp_result = ExperimentResult(
                    id=uuid.uuid4(),
                    experiment_id=experiment.id,
                    scheduler_algorithm=b_res.scheduler_algorithm,
                    total_energy_kwh=b_res.total_energy_kwh,
                    total_co2eq_grams=b_res.total_co2eq_grams,
                    avg_execution_time_seconds=b_res.avg_execution_time_seconds,
                    avg_latency_ms=b_res.avg_latency_ms,
                    deadline_compliance_rate=b_res.deadline_compliance_rate,
                    failure_rate=b_res.failure_rate,
                    retry_rate=b_res.retry_rate,
                    duplicate_execution_count=b_res.duplicate_execution_count,
                    deferral_rate=b_res.deferral_rate,
                    avg_region_utilization=b_res.avg_region_utilization,
                    detailed_metrics=b_res.detailed_metrics,
                    created_at=completion_time,
                )
                session.add(exp_result)

            await session.flush()

        return experiment, benchmark_results
