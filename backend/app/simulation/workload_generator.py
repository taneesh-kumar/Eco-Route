"""Deterministic synthetic workload generator with explicit PRNG seed control."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import random
from typing import List
import uuid

from app.domain.job import Job as DomainJob
from app.domain.values import JobPriority, WorkloadDemand
from app.persistence.models.enums import JobStatus, WorkloadType


class WorkloadGenerator:
    """Generates synthetic workload populations deterministically.

    Workload archetypes:
    - BATCH: Moderate CPU (4-16), High Memory (16-64GB), Longer Duration (300-1200s), Relaxed deadline slack.
    - INFERENCE: Low CPU (1-4), Low Memory (2-8GB), Short Duration (5-30s), Tight deadline slack.
    - TRAINING: High CPU (16-64), High Memory (64-128GB), Long Duration (1200-3600s), Moderate deadline slack.
    """

    @staticmethod
    def generate_population(
        count: int,
        seed: int,
        base_time: datetime,
    ) -> List[DomainJob]:
        """Generates an ordered list of DomainJob workloads using an isolated PRNG."""
        rng = random.Random(seed)
        jobs: List[DomainJob] = []

        archetypes = [
            (WorkloadType.BATCH, 0.40),
            (WorkloadType.INFERENCE, 0.40),
            (WorkloadType.TRAINING, 0.20),
        ]

        for i in range(count):
            # Select archetype based on distribution
            r = rng.random()
            if r < archetypes[0][1]:
                w_type = WorkloadType.BATCH
                cpu = Decimal(str(rng.choice([4, 8, 12, 16])))
                mem = Decimal(str(rng.choice([16, 32, 64])))
                dur = Decimal(str(rng.randint(300, 1200)))
                slack_mult = Decimal(str(rng.uniform(1.5, 3.0)))
            elif r < archetypes[0][1] + archetypes[1][1]:
                w_type = WorkloadType.INFERENCE
                cpu = Decimal(str(rng.choice([1, 2, 4])))
                mem = Decimal(str(rng.choice([2, 4, 8])))
                dur = Decimal(str(rng.randint(5, 30)))
                slack_mult = Decimal(str(rng.uniform(1.1, 1.8)))
            else:
                w_type = WorkloadType.TRAINING
                cpu = Decimal(str(rng.choice([16, 32, 64])))
                mem = Decimal(str(rng.choice([64, 96, 128])))
                dur = Decimal(str(rng.randint(1200, 3600)))
                slack_mult = Decimal(str(rng.uniform(1.3, 2.2)))

            deadline_seconds = float(dur * slack_mult)
            deadline = base_time + timedelta(seconds=deadline_seconds)

            demand = WorkloadDemand(
                cpu_demand=cpu,
                memory_demand=mem,
                base_execution_duration=dur,
            )
            job = DomainJob(
                id=uuid.uuid4(),
                workload_name=f"sim-{w_type.value.lower()}-{i+1:04d}",
                workload_type=w_type,
                demand=demand,
                priority=JobPriority(rng.randint(1, 10)),
                deadline=deadline,
                status=JobStatus.PENDING,
                current_attempt_count=0,
                max_retries=3,
                created_at=base_time,
            )
            jobs.append(job)

        return jobs
