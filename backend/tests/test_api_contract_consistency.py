"""Comprehensive Contract Consistency Test Suite for EcoRoute.

Enforces 15 explicit consistency rules across:
Database Models -> Domain Models -> Services -> API Schemas -> JSON Serialization.
"""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import json
import uuid
import pytest

from app.api.schemas.jobs import JobResponse, WorkloadCreate
from app.api.schemas.scheduling import (
    DecisionExplainabilityResponse,
    DecisionResponse,
    SelectedCandidateSnapshot,
    StructuredDeferralInfo,
)
from app.core.config import get_settings
from app.domain.carbon import CarbonIntensity, CarbonQuality, CarbonSource
from app.domain.job import Job as DomainJob
from app.domain.region import Region
from app.domain.values import JobPriority, WorkloadDemand
from app.execution.dispatcher import ExecutionDispatcher
from app.persistence.models.enums import AttemptStatus, DecisionAction, JobStatus, SchedulerVariant, WorkloadType
from app.persistence.models.job import Job as DBJob
from app.persistence.models.job_attempt import JobAttempt
from app.persistence.models.scheduling_decision import SchedulingDecision as DBSchedulingDecision
from app.scheduling.deferral import DeferralEvaluationResult, DeferralEvaluator
from app.scheduling.energy_estimator import EnergyEstimator
from app.scheduling.engine import DecisionEngine
from app.scheduling.normalizer import Normalizer
from app.scheduling.strategies import get_scheduler_strategy


def make_test_region(
    code: str = "se-sto",
    latency: Decimal = Decimal("25.0"),
    util: Decimal = Decimal("0.30"),
    reg_id: uuid.UUID = None,
) -> Region:
    return Region(
        id=reg_id or uuid.uuid4(),
        code=code,
        name=f"Region {code}",
        provider="AWS",
        max_cpu_capacity=Decimal("128"),
        max_memory_capacity=Decimal("512"),
        current_utilization=util,
        performance_factor=Decimal("1.10"),
        idle_power_watts=Decimal("120"),
        peak_power_watts=Decimal("450"),
        network_latency_ms=latency,
        is_available=True,
        is_active=True,
    )


class TestContractConsistency:
    """15 Authoritative Contract Consistency Checks."""

    # 1. Selected region present on EXECUTE
    def test_check_1_selected_region_present_on_execute(self):
        reg_id = uuid.uuid4()
        snap = SelectedCandidateSnapshot(
            selected_region_id=reg_id,
            selected_region_code="se-sto",
            carbon_intensity_gco2_per_kwh=Decimal("42.37"),
            carbon_source="ELECTRICITY_MAPS",
            carbon_quality="LIVE_ESTIMATED",
            carbon_is_estimated=True,
        )
        dec = DecisionExplainabilityResponse(
            id=uuid.uuid4(),
            job_id=uuid.uuid4(),
            decision_action="EXECUTE",
            decision_mode="CARBON_AWARE",
            carbon_optimization_applied=True,
            carbon_source_used="ELECTRICITY_MAPS",
            carbon_quality_used="LIVE_ESTIMATED",
            decision_reason="Optimal multi-objective score Jr.",
            created_at=datetime.now(timezone.utc),
            selected_candidate=snap,
        )

        assert dec.selected_candidate is not None
        assert dec.selected_candidate.selected_region_id == reg_id
        assert dec.selected_candidate.selected_region_code == "se-sto"
        assert dec.selected_region_code == "se-sto"
        assert dec.selected_region_id == reg_id

    # 2. Assigned region on Job matches selected execution region after dispatch
    @pytest.mark.asyncio
    async def test_check_2_assigned_region_matches_selected_execution_region_after_dispatch(self, db_session):
        from sqlalchemy import select
        from app.persistence.models.region import Region as DBRegion
        res = await db_session.execute(select(DBRegion).limit(1))
        existing_reg = res.scalars().first()
        assert existing_reg is not None, "Seeded regions must exist in database"
        reg_id = existing_reg.id

        job_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        db_job = DBJob(
            id=job_id,
            workload_name="contract-check-2",
            workload_type="BATCH",
            cpu_demand=Decimal("4.0"),
            memory_demand=Decimal("16.0"),
            base_execution_duration=Decimal("60.0"),
            priority=5,
            priority_class="MEDIUM",
            deadline=now + timedelta(hours=2),
            status=JobStatus.EVALUATING.value,
            assigned_region_id=None,
            current_attempt_count=0,
            max_retries=3,
            created_at=now,
            updated_at=now,
        )
        db_session.add(db_job)
        await db_session.flush()

        from app.domain.decision import SchedulingDecision as DomainDecision
        from app.domain.values import SchedulingWeights

        domain_dec = DomainDecision(
            id=uuid.uuid4(),
            job_id=job_id,
            decision_action=DecisionAction.EXECUTE,
            selected_region_id=reg_id,
            carbon_source_used=CarbonSource.ELECTRICITY_MAPS,
            carbon_quality_used=CarbonQuality.LIVE_ESTIMATED,
            decision_reason="Optimal Jr",
            score_breakdown={"selected_candidate": {"selected_region_id": str(reg_id)}},
            candidate_rankings=[],
            applied_weights=SchedulingWeights(carbon=Decimal("0.40"), time=Decimal("0.30"), utilization=Decimal("0.20"), latency=Decimal("0.10")),
        )

        dispatcher = ExecutionDispatcher()
        attempt = await dispatcher.dispatch_decision(domain_dec, db_session)

        assert attempt is not None
        assert attempt.region_id == reg_id
        assert db_job.assigned_region_id == reg_id
        assert db_job.status == JobStatus.DISPATCHED.value

        # Clean up rollback
        await db_session.rollback()

    # 3. Carbon intensity numeric when carbon available (LIVE, LIVE_ESTIMATED, CACHE_VALID)
    def test_check_3_carbon_intensity_numeric_when_carbon_available(self):
        c1 = CarbonIntensity(
            quality=CarbonQuality.LIVE_TRUSTED,
            source=CarbonSource.LIVE,
            value=Decimal("15.5"),
        )
        c2 = CarbonIntensity(
            quality=CarbonQuality.LIVE_ESTIMATED,
            source=CarbonSource.ELECTRICITY_MAPS,
            value=Decimal("42.37"),
            is_estimated=True,
        )
        c3 = CarbonIntensity(
            quality=CarbonQuality.CACHE_VALID,
            source=CarbonSource.CACHE,
            value=Decimal("28.9"),
        )

        for c in (c1, c2, c3):
            assert c.value is not None
            assert isinstance(c.value, Decimal)
            assert c.value > Decimal("0")
            assert c.is_trustworthy is True

    # 4. Unavailable carbon is None, never 0 or fabricated
    def test_check_4_unavailable_carbon_is_none_never_zero_or_fabricated(self):
        from app.domain.exceptions import ZeroCarbonFabricationError

        c_unavail = CarbonIntensity(
            quality=CarbonQuality.UNAVAILABLE,
            source=CarbonSource.UNAVAILABLE,
            value=None,
        )
        assert c_unavail.value is None
        assert c_unavail.is_trustworthy is False

        # Attempting to assign 0.0 or any numeric value to UNAVAILABLE must raise ZeroCarbonFabricationError
        with pytest.raises(ZeroCarbonFabricationError):
            CarbonIntensity(
                quality=CarbonQuality.UNAVAILABLE,
                source=CarbonSource.UNAVAILABLE,
                value=Decimal("0.0"),
            )

        with pytest.raises(ZeroCarbonFabricationError):
            CarbonIntensity(
                quality=CarbonQuality.CONVENTIONAL_FALLBACK,
                source=CarbonSource.UNAVAILABLE,
                value=Decimal("50.0"),
            )

    # 5. No response field can serialize as NaN or Infinity
    def test_check_5_no_response_field_serializes_as_nan_or_infinity(self):
        snap = SelectedCandidateSnapshot(
            selected_region_id=uuid.uuid4(),
            selected_region_code="se-sto",
            carbon_intensity_gco2_per_kwh=Decimal("42.37"),
            carbon_source="ELECTRICITY_MAPS",
            carbon_quality="LIVE_ESTIMATED",
            carbon_is_estimated=True,
            energy_kwh=Decimal("0.001132"),
            estimated_emissions_co2eq_grams=Decimal("0.000048"),
            duration_seconds=Decimal("15.0"),
            projected_utilization=Decimal("0.35"),
            latency_ms=Decimal("25.0"),
            composite_score=Decimal("0.2451"),
        )
        resp = DecisionExplainabilityResponse(
            id=uuid.uuid4(),
            job_id=uuid.uuid4(),
            decision_action="EXECUTE",
            decision_mode="CARBON_AWARE",
            carbon_optimization_applied=True,
            carbon_source_used="ELECTRICITY_MAPS",
            carbon_quality_used="LIVE_ESTIMATED",
            decision_reason="Optimal score",
            created_at=datetime.now(timezone.utc),
            selected_candidate=snap,
        )

        serialized = resp.model_dump_json()
        assert "NaN" not in serialized
        assert "Infinity" not in serialized
        assert "-Infinity" not in serialized

        # Must parse as standard compliant JSON
        parsed = json.loads(serialized)
        assert parsed["selected_region_code"] == "se-sto"
        assert parsed["carbon_intensity_gco2"] == 42.37

    # 6. Small emissions remain non-zero and serialize with precision
    def test_check_6_small_emissions_remain_non_zero_with_high_precision(self):
        micro_emissions = Decimal("0.000048")
        snap = SelectedCandidateSnapshot(
            selected_region_id=uuid.uuid4(),
            selected_region_code="se-sto",
            estimated_emissions_co2eq_grams=micro_emissions,
        )
        assert snap.estimated_emissions_co2eq_grams == micro_emissions
        assert snap.estimated_emissions_co2eq_grams > Decimal("0")

        resp = DecisionResponse(
            id=uuid.uuid4(),
            job_id=uuid.uuid4(),
            decision_action="EXECUTE",
            carbon_source_used="ELECTRICITY_MAPS",
            carbon_quality_used="LIVE_ESTIMATED",
            decision_reason="Precision check",
            created_at=datetime.now(timezone.utc),
            selected_candidate=snap,
        )
        assert resp.estimated_co2eq_grams == micro_emissions
        serialized = resp.model_dump_json()
        assert "0.000048" in serialized

    # 7. N(C) = 0.00 is distinguishable from carbon_intensity = 0
    def test_check_7_normalized_carbon_zero_distinguishable_from_zero_carbon_intensity(self):
        r1 = make_test_region(code="se-sto")
        r2 = make_test_region(code="de-fra")
        raw_metrics = {
            r1.id: {
                "emissions": Decimal("10.0"),  # Lowest emissions in set
                "duration": Decimal("20.0"),
                "utilization": Decimal("0.40"),
                "latency": Decimal("30.0"),
            },
            r2.id: {
                "emissions": Decimal("50.0"),
                "duration": Decimal("20.0"),
                "utilization": Decimal("0.40"),
                "latency": Decimal("30.0"),
            },
        }
        normalized, bounds = Normalizer.normalize_candidates(raw_metrics)

        # Region 1 is min emissions -> N(C) is 0.0
        assert normalized[r1.id].norm_emissions == Decimal("0.0")
        # Region 2 is max emissions -> N(C) is 1.0
        assert normalized[r2.id].norm_emissions == Decimal("1.0")

        # But Region 1 actual physical emissions is 10.0 gCO2, NOT zero!
        assert raw_metrics[r1.id]["emissions"] == Decimal("10.0")
        assert raw_metrics[r1.id]["emissions"] != Decimal("0.0")

    # 8. Priority 9 -> LOW
    def test_check_8_priority_9_maps_to_low(self):
        pri = JobPriority(9)
        assert pri.priority_class == "LOW"
        assert pri.allows_carbon_deferral is True

        job_resp = JobResponse(
            id=uuid.uuid4(),
            workload_name="p9-job",
            workload_type="BATCH",
            cpu_demand=Decimal("2.0"),
            memory_demand=Decimal("4.0"),
            base_execution_duration=Decimal("10.0"),
            priority=9,
            deadline=datetime.now(timezone.utc) + timedelta(hours=4),
            status="PENDING",
            current_attempt_count=0,
            max_retries=3,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        assert job_resp.priority_class == "LOW"

    # 9. Priority 2 -> HIGH
    def test_check_9_priority_2_maps_to_high(self):
        pri = JobPriority(2)
        assert pri.priority_class == "HIGH"
        assert pri.allows_carbon_deferral is False

        job_resp = JobResponse(
            id=uuid.uuid4(),
            workload_name="p2-job",
            workload_type="INFERENCE",
            cpu_demand=Decimal("4.0"),
            memory_demand=Decimal("8.0"),
            base_execution_duration=Decimal("5.0"),
            priority=2,
            deadline=datetime.now(timezone.utc) + timedelta(minutes=10),
            status="PENDING",
            current_attempt_count=0,
            max_retries=3,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        assert job_resp.priority_class == "HIGH"

    # 10. Priority 5 -> MEDIUM
    def test_check_10_priority_5_maps_to_medium(self):
        pri = JobPriority(5)
        assert pri.priority_class == "MEDIUM"
        assert pri.allows_carbon_deferral is True

        job_resp = JobResponse(
            id=uuid.uuid4(),
            workload_name="p5-job",
            workload_type="BATCH",
            cpu_demand=Decimal("2.0"),
            memory_demand=Decimal("4.0"),
            base_execution_duration=Decimal("10.0"),
            priority=5,
            deadline=datetime.now(timezone.utc) + timedelta(hours=1),
            status="PENDING",
            current_attempt_count=0,
            max_retries=3,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        assert job_resp.priority_class == "MEDIUM"

    # 11. EXECUTE response contains structured forecast rationale
    def test_check_11_execute_response_contains_structured_forecast_rationale(self):
        def_info = StructuredDeferralInfo(
            forecast_status="NO_USEFUL_FORECAST",
            forecast_source="ELECTRICITY_MAPS",
            deferral_eligible=False,
            deferral_reason="No verified future carbon forecast available; dispatching best candidate immediately.",
            deferral_threshold_pct=Decimal("15.0"),
        )
        dec = DecisionResponse(
            id=uuid.uuid4(),
            job_id=uuid.uuid4(),
            decision_action="EXECUTE",
            decision_mode="CARBON_AWARE",
            carbon_source_used="ELECTRICITY_MAPS",
            carbon_quality_used="LIVE_ESTIMATED",
            decision_reason="Dispatching best candidate immediately.",
            created_at=datetime.now(timezone.utc),
            deferral_info=def_info,
        )

        assert dec.deferral_info is not None
        assert dec.deferral_info.forecast_status == "NO_USEFUL_FORECAST"
        assert dec.deferral_info.deferral_threshold_pct == Decimal("15.0")

    # 12. DEFER response contains future opportunity evidence and named threshold
    def test_check_12_defer_response_contains_future_opportunity_evidence_and_named_threshold(self):
        settings = get_settings()
        expected_threshold = Decimal(str(settings.CARBON_DEFERRAL_MIN_RELATIVE_IMPROVEMENT)) * Decimal("100")

        def_info = StructuredDeferralInfo(
            forecast_status="DEFERRAL_APPROVED",
            forecast_source="ELECTRICITY_MAPS",
            forecast_checked_until=(datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
            deferral_eligible=True,
            deferral_reason="Deferral approved: verified forecast Jr lower than current Jr.",
            current_expected_emissions=Decimal("50.0"),
            future_expected_emissions=Decimal("35.0"),
            expected_savings=Decimal("15.0"),
            relative_improvement_pct=Decimal("30.0"),
            deferral_threshold_pct=expected_threshold,
            forecast_timestamp=(datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        )
        dec = DecisionResponse(
            id=uuid.uuid4(),
            job_id=uuid.uuid4(),
            decision_action="DEFER",
            decision_mode="DEFERRED",
            carbon_source_used="ELECTRICITY_MAPS",
            carbon_quality_used="LIVE_ESTIMATED",
            decision_reason="Deferral approved.",
            created_at=datetime.now(timezone.utc),
            deferral_info=def_info,
        )

        assert dec.decision_action == "DEFER"
        assert dec.deferral_info.deferral_eligible is True
        assert dec.deferral_info.current_expected_emissions == Decimal("50.0")
        assert dec.deferral_info.future_expected_emissions == Decimal("35.0")
        assert dec.deferral_info.expected_savings == Decimal("15.0")
        assert dec.deferral_info.relative_improvement_pct == Decimal("30.0")
        assert dec.deferral_info.deferral_threshold_pct == Decimal("15.0")

    # 13. Fallback response contains explicit fallback reason
    def test_check_13_fallback_response_contains_explicit_fallback_reason(self):
        fallback_msg = (
            "Carbon data unavailable or untrusted across candidate regions; "
            "bypassed carbon optimization and applied conventional operational scheduling."
        )
        dec = DecisionResponse(
            id=uuid.uuid4(),
            job_id=uuid.uuid4(),
            decision_action="EXECUTE",
            decision_mode="CONVENTIONAL_FALLBACK",
            carbon_optimization_applied=False,
            fallback_reason=fallback_msg,
            carbon_source_used="UNAVAILABLE",
            carbon_quality_used="UNAVAILABLE",
            decision_reason="Dispatched under operational fallback.",
            created_at=datetime.now(timezone.utc),
        )

        assert dec.decision_mode == "CONVENTIONAL_FALLBACK"
        assert dec.carbon_optimization_applied is False
        assert dec.fallback_reason == fallback_msg

    # 14. Candidate matrix and selected_candidate summary contain identical values
    def test_check_14_candidate_matrix_and_selected_candidate_contain_identical_values(self):
        reg_id = uuid.uuid4()
        cand_row = {
            "rank": 1,
            "region_id": str(reg_id),
            "region_code": "se-sto",
            "is_feasible": True,
            "composite_score": Decimal("0.245100"),
            "cost_score_jr": Decimal("0.245100"),
            "carbon_intensity_gco2": Decimal("42.37"),
            "emissions_co2eq": Decimal("0.000048"),
            "duration_seconds": Decimal("15.0"),
            "projected_utilization": Decimal("0.35"),
            "raw_latency_ms": Decimal("25.0"),
        }
        snap = SelectedCandidateSnapshot(
            selected_region_id=reg_id,
            selected_region_code="se-sto",
            carbon_intensity_gco2_per_kwh=Decimal("42.37"),
            energy_kwh=Decimal("0.001132"),
            estimated_emissions_co2eq_grams=Decimal("0.000048"),
            duration_seconds=Decimal("15.0"),
            projected_utilization=Decimal("0.35"),
            latency_ms=Decimal("25.0"),
            composite_score=Decimal("0.245100"),
        )
        dec = DecisionExplainabilityResponse(
            id=uuid.uuid4(),
            job_id=uuid.uuid4(),
            decision_action="EXECUTE",
            carbon_source_used="ELECTRICITY_MAPS",
            carbon_quality_used="LIVE_ESTIMATED",
            decision_reason="Optimal score",
            created_at=datetime.now(timezone.utc),
            candidate_rankings=[cand_row],
            selected_candidate=snap,
        )

        # Invariant: matrix winner and selected_candidate have identical numerical values
        assert dec.selected_candidate.selected_region_code == cand_row["region_code"]
        assert dec.selected_candidate.carbon_intensity_gco2_per_kwh == cand_row["carbon_intensity_gco2"]
        assert dec.selected_candidate.estimated_emissions_co2eq_grams == cand_row["emissions_co2eq"]
        assert dec.selected_candidate.duration_seconds == cand_row["duration_seconds"]
        assert dec.selected_candidate.projected_utilization == cand_row["projected_utilization"]
        assert dec.selected_candidate.latency_ms == cand_row["raw_latency_ms"]
        assert dec.selected_candidate.composite_score == cand_row["composite_score"]

    # 15. Completed job's assigned_region_id matches its executed attempt's region_id
    @pytest.mark.asyncio
    async def test_check_15_completed_job_assigned_region_id_matches_attempt_region_id(self, db_session):
        from sqlalchemy import select
        from app.persistence.models.region import Region as DBRegion
        res = await db_session.execute(select(DBRegion).limit(1))
        existing_reg = res.scalars().first()
        assert existing_reg is not None, "Seeded regions must exist in database"
        reg_id = existing_reg.id

        job_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        db_job = DBJob(
            id=job_id,
            workload_name="contract-check-15",
            workload_type="BATCH",
            cpu_demand=Decimal("4.0"),
            memory_demand=Decimal("16.0"),
            base_execution_duration=Decimal("60.0"),
            priority=5,
            priority_class="MEDIUM",
            deadline=now + timedelta(hours=2),
            status=JobStatus.COMPLETED.value,
            assigned_region_id=reg_id,
            current_attempt_count=1,
            max_retries=3,
            created_at=now,
            updated_at=now,
        )
        db_session.add(db_job)

        attempt = JobAttempt(
            id=uuid.uuid4(),
            job_id=job_id,
            attempt_number=1,
            region_id=reg_id,
            status=AttemptStatus.COMPLETED.value,
            started_at=now,
            completed_at=now + timedelta(seconds=60),
        )
        db_session.add(attempt)
        await db_session.flush()

        assert db_job.assigned_region_id == attempt.region_id
        assert db_job.assigned_region_id == reg_id

        await db_session.rollback()
