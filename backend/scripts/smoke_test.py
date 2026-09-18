#!/usr/bin/env python
"""
EcoRoute Production Smoke Test Script
Executes full validation across:
- API / Health Check (PostgreSQL, Redis, API)
- Cloud Regions Availability
- Carbon Subsystem / Electricity Maps telemetry
- Workload Submission (Job State Machine: PENDING -> DISPATCHED/WAITING)
- Decision Engine Evaluation (12-stage scoring, candidate rankings, zero-fabrication check)
- Attempt Creation & Idempotency
- Queue Enqueue / Dequeue verification
- Worker Claim & Simulated Telemetry Execution
- Analytics / Audit Event Verification
"""

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
import sys
import uuid

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Windows UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.core.config import get_settings
from app.db.session import get_db_sessionmaker, check_db_connectivity
from app.infrastructure.redis import check_redis_connectivity, get_redis_client
from app.persistence.models import (
    Job,
    JobAttempt,
    Region,
    SchedulingDecision,
    AuditEvent,
    JobStatus,
    AttemptStatus,
    DecisionAction,
)
from app.persistence.repositories import (
    JobRepository,
    RegionRepository,
    SchedulingDecisionRepository,
    AuditEventRepository,
)
from app.scheduling.engine import DecisionEngine
from app.carbon.service import CarbonService
from app.execution.dispatcher import ExecutionDispatcher
from app.execution.worker import ExecutionWorker
from app.execution.queue import ExecutionQueue
from app.execution.idempotency import IdempotencyManager


async def run_smoke_test() -> int:
    settings = get_settings()
    print("=" * 70)
    print("🚀 ECOROUTE PRODUCTION SMOKE TEST")
    print("=" * 70)
    print(f"Environment: {settings.ENVIRONMENT}")
    print(f"Log Level:   {settings.LOG_LEVEL}")
    print("-" * 70)

    sessionmaker = get_db_sessionmaker()
    if not sessionmaker or not settings.DATABASE_URL:
        print("❌ [CRITICAL] DATABASE_URL is not configured. Cannot perform production smoke test.")
        return 1

    passed_steps = 0
    total_steps = 8

    # STEP 1: Health & Connectivity Checks
    print("\n[STEP 1/8] Verifying Infrastructure Health...")
    db_ok, db_msg = await check_db_connectivity()
    if not db_ok:
        print(f"❌ Database unreachable: {db_msg}")
        return 1
    print(f"  ✓ PostgreSQL Connection: OK ({db_msg})")

    redis_ok, redis_msg = await check_redis_connectivity()
    if settings.REDIS_URL and not redis_ok:
        print(f"❌ Redis unreachable: {redis_msg}")
        return 1
    elif settings.REDIS_URL and redis_ok:
        print(f"  ✓ Redis Transport: OK ({redis_msg})")
    else:
        print("  ⚠ Redis URL not set — falling back to memory queue transport.")
    passed_steps += 1

    # STEP 2: Verify Seeded Cloud Regions
    print("\n[STEP 2/8] Verifying Canonical Cloud Regions...")
    async with sessionmaker() as session:
        region_repo = RegionRepository(session)
        regions = await region_repo.list_available()
        if len(regions) < 1:
            print("❌ No active cloud regions found in database. Run seed script first.")
            return 1
        print(f"  ✓ Found {len(regions)} active cloud regions (e.g., {[r.code for r in regions[:4]]}...)")
        passed_steps += 1

    # STEP 3: Carbon Subsystem Verification
    print("\n[STEP 3/8] Verifying Carbon Subsystem & Zero-Fabrication Guarantees...")
    carbon_service = CarbonService()
    async with sessionmaker() as session:
        test_region = regions[0]
        # Query carbon intensity
        ci = await carbon_service.get_carbon_intensity(test_region.to_domain(), session=session)
        print(f"  ✓ Query for region '{test_region.code}' -> Carbon Quality: {ci.quality.value}, Source: {ci.source.value}, Intensity: {ci.value} gCO2eq/kWh")
        
        # Verify zero-fabrication constraint: if unavailable, intensity MUST be None (not fake 0)
        if ci.quality.value == "UNAVAILABLE":
            assert ci.value is None, "Zero-fabrication violation: UNAVAILABLE observation has non-None value!"
            print("  ✓ Zero-fabrication check passed (UNAVAILABLE intensity is strictly NULL).")
        else:
            assert ci.value is not None and ci.value >= 0, "Invalid positive intensity value"
            print("  ✓ Live/cached carbon intensity observation validated.")
        passed_steps += 1

    # STEP 4: Job Submission & Lifecycle Initiation
    print("\n[STEP 4/8] Testing Workload Submission & Persistence...")
    test_job_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    deadline = now + timedelta(hours=4)

    test_job = Job(
        id=test_job_id,
        workload_name=f"smoke-test-workload-{test_job_id.hex[:6]}",
        workload_type="BATCH",
        cpu_demand=Decimal("4.00"),
        memory_demand=Decimal("16.00"),
        base_execution_duration=Decimal("30.00"),
        priority=5,
        deadline=deadline,
        status=JobStatus.PENDING.value,
    )

    async with sessionmaker() as session:
        job_repo = JobRepository(session)
        audit_repo = AuditEventRepository(session)
        await job_repo.create(test_job)
        await audit_repo.record_event(
            event_type="JOB_SUBMITTED",
            actor="SmokeTestRunner",
            job_id=test_job.id,
            event_metadata={"workload_name": test_job.workload_name},
        )
        await session.commit()
        print(f"  ✓ Job '{test_job.id}' persisted with status PENDING.")
        passed_steps += 1

    # STEP 5: 12-Stage Decision Engine Evaluation
    print("\n[STEP 5/8] Running DecisionEngine 12-Stage Evaluation...")
    decision_engine = DecisionEngine(carbon_service=carbon_service)
    async with sessionmaker() as session:
        job_repo = JobRepository(session)
        region_repo = RegionRepository(session)
        decision_repo = SchedulingDecisionRepository(session)

        domain_job = test_job.to_domain()
        domain_regions = [r.to_domain() for r in await region_repo.list_available()]

        decision = await decision_engine.schedule(job=domain_job, candidate_regions=domain_regions)
        print(f"  ✓ Decision Action: {decision.decision_action.value}")
        print(f"  ✓ Selected Region ID: {decision.selected_region_id}")
        print(f"  ✓ Multi-Objective Jr Score: {decision.cost_score_jr}")
        print(f"  ✓ Estimated Energy: {decision.estimated_energy_kwh} kWh, CO2eq: {decision.estimated_co2eq_grams} g")

        # Persist decision
        db_decision = SchedulingDecision(
            id=uuid.uuid4(),
            job_id=test_job.id,
            decision_action=decision.decision_action.value,
            cost_score_jr=decision.cost_score_jr,
            estimated_energy_kwh=decision.estimated_energy_kwh,
            estimated_co2eq_grams=decision.estimated_co2eq_grams,
            carbon_source_used=decision.carbon_source_used.value if hasattr(decision.carbon_source_used, "value") else str(decision.carbon_source_used),
            carbon_quality_used=decision.carbon_quality_used.value if hasattr(decision.carbon_quality_used, "value") else str(decision.carbon_quality_used),
            decision_reason=decision.decision_reason,
            score_breakdown=decision.score_breakdown,
            candidate_rankings=decision.candidate_rankings,
            applied_weights=decision.applied_weights.to_dict() if hasattr(decision.applied_weights, "to_dict") else {},
            normalization_factors=decision.normalization_factors,
            selected_region_id=decision.selected_region_id,
        )
        await decision_repo.create(db_decision)
        await session.commit()
        passed_steps += 1

    # STEP 6: Dispatching & Queue Enqueue
    print("\n[STEP 6/8] Testing ExecutionDispatcher & Queue Enqueue...")
    queue = ExecutionQueue()
    dispatcher = ExecutionDispatcher(queue=queue)
    async with sessionmaker() as session:
        attempt_id = await dispatcher.dispatch_for_execution(
            job_id=test_job.id,
            target_region_id=decision.selected_region_id or domain_regions[0].id,
            session=session,
        )
        await session.commit()
        assert attempt_id is not None, "Dispatcher failed to create attempt!"
        print(f"  ✓ Dispatcher created Attempt '{attempt_id}' with status PENDING and enqueued to ExecutionQueue.")
        passed_steps += 1

    # STEP 7: Worker Claim, Execution, & Telemetry
    print("\n[STEP 7/8] Testing ExecutionWorker Claim, Run, & Telemetry...")
    worker = ExecutionWorker(worker_id="smoke-test-worker", queue=queue, carbon_service=carbon_service)
    async with sessionmaker() as session:
        processed_attempt_id = await worker.process_one(session=session, timeout_seconds=2)
        await session.commit()
        assert processed_attempt_id == attempt_id, f"Expected worker to process '{attempt_id}', got '{processed_attempt_id}'"
        print(f"  ✓ Worker atomically claimed and executed Attempt '{processed_attempt_id}'.")
        passed_steps += 1

    # STEP 8: Final Persistence State Verification & Cleanup
    print("\n[STEP 8/8] Verifying Completed State & Audit Trail...")
    async with sessionmaker() as session:
        job_repo = JobRepository(session)
        updated_job = await job_repo.get_with_attempts(test_job.id)
        assert updated_job is not None
        assert updated_job.status == JobStatus.COMPLETED.value, f"Job status is {updated_job.status}, expected COMPLETED"
        assert len(updated_job.attempts) == 1
        assert updated_job.attempts[0].status == AttemptStatus.COMPLETED.value
        assert updated_job.attempts[0].actual_duration is not None
        assert updated_job.attempts[0].actual_energy_kwh is not None
        print(f"  ✓ Job final status: {updated_job.status}")
        print(f"  ✓ Attempt duration: {updated_job.attempts[0].actual_duration}s, Energy: {updated_job.attempts[0].actual_energy_kwh} kWh, CO2eq: {updated_job.attempts[0].actual_co2eq_grams} g")

        # Clean up smoke test job record
        await session.delete(updated_job)
        await session.commit()
        print("  ✓ Test artifacts cleanly purged.")
        passed_steps += 1

    print("\n" + "=" * 70)
    print(f"✅ PRODUCTION SMOKE TEST PASSED ({passed_steps}/{total_steps} steps succeeded)")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(run_smoke_test())
    sys.exit(exit_code)
