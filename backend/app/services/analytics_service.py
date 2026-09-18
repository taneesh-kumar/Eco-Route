"""Analytics application service computing truthful KPIs and audit summaries."""

from decimal import Decimal
from typing import List, Optional, Tuple
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.analytics import AnalyticsSummaryResponse
from app.persistence.models.audit_event import AuditEvent
from app.persistence.models.enums import AttemptStatus, JobStatus
from app.persistence.models.job import Job
from app.persistence.models.job_attempt import JobAttempt


class AnalyticsService:
    """Computes verified sustainability metrics and serves audit trail records."""

    async def get_summary(self, session: AsyncSession) -> AnalyticsSummaryResponse:
        """Computes aggregate KPIs from persisted jobs and attempts.

        Guarantees zero-fabrication: if metrics lack counterfactual baseline,
        counterfactual_carbon_reduction_pct is returned as None.
        """
        # 1. Total jobs count by status
        stmt_jobs = select(
            Job.status,
            func.count(Job.id),
        ).group_by(Job.status)
        res_jobs = await session.execute(stmt_jobs)
        status_counts = dict(res_jobs.all())

        completed_jobs = status_counts.get(JobStatus.COMPLETED.value, 0)
        failed_jobs = status_counts.get(JobStatus.FAILED.value, 0)
        waiting_jobs = status_counts.get(JobStatus.WAITING.value, 0)
        running_jobs = status_counts.get(JobStatus.RUNNING.value, 0)
        total_jobs = sum(status_counts.values())

        # 2. Aggregations from completed attempts
        stmt_attempts = select(
            func.coalesce(func.sum(JobAttempt.actual_energy_kwh), Decimal("0.0")),
            func.coalesce(func.sum(JobAttempt.actual_co2eq_grams), Decimal("0.0")),
            func.coalesce(func.avg(JobAttempt.actual_duration), Decimal("0.0")),
            func.count(JobAttempt.id),
        ).where(JobAttempt.status == AttemptStatus.COMPLETED.value)
        res_attempts = await session.execute(stmt_attempts)
        total_energy, total_co2, avg_duration, completed_attempts_count = res_attempts.first()

        stmt_tot_attempts = select(func.count(JobAttempt.id))
        res_tot = await session.execute(stmt_tot_attempts)
        total_attempts = res_tot.scalar() or 0

        # 3. SLA compliance: completed jobs where last attempt completed_at <= job.deadline
        stmt_sla = (
            select(func.count(Job.id))
            .join(JobAttempt, Job.id == JobAttempt.job_id)
            .where(
                Job.status == JobStatus.COMPLETED.value,
                JobAttempt.status == AttemptStatus.COMPLETED.value,
                JobAttempt.completed_at <= Job.deadline,
            )
        )
        res_sla = await session.execute(stmt_sla)
        on_time_jobs = res_sla.scalar() or 0

        sla_compliance = (
            (Decimal(str(on_time_jobs)) / Decimal(str(completed_jobs))).quantize(Decimal("0.0001"))
            if completed_jobs > 0
            else Decimal("1.0000")
        )

        failure_rate = (
            (Decimal(str(failed_jobs)) / Decimal(str(total_jobs))).quantize(Decimal("0.0001"))
            if total_jobs > 0
            else Decimal("0.0000")
        )

        deferral_rate = (
            (Decimal(str(waiting_jobs)) / Decimal(str(total_jobs))).quantize(Decimal("0.0001"))
            if total_jobs > 0
            else Decimal("0.0000")
        )

        retry_rate = (
            (Decimal(str(max(0, total_attempts - total_jobs))) / Decimal(str(total_jobs))).quantize(Decimal("0.0001"))
            if total_jobs > 0
            else Decimal("0.0000")
        )

        # 4. Truthful Baseline Carbon Savings (Critical Rule #23 & #46)
        from app.persistence.models.scheduling_decision import SchedulingDecision
        stmt_savings = (
            select(
                func.coalesce(func.sum(SchedulingDecision.baseline_co2eq_grams), Decimal("0.0")),
                func.coalesce(func.sum(SchedulingDecision.estimated_co2eq_grams), Decimal("0.0")),
                func.count(SchedulingDecision.id),
            )
            .join(Job, SchedulingDecision.job_id == Job.id)
            .where(
                Job.status == JobStatus.COMPLETED.value,
                SchedulingDecision.baseline_co2eq_grams.isnot(None),
                SchedulingDecision.estimated_co2eq_grams.isnot(None),
            )
        )
        res_savings = await session.execute(stmt_savings)
        tot_base_co2, tot_eco_co2, count_baseline = res_savings.first()

        carbon_savings_pct: Optional[Decimal] = None
        if count_baseline > 0 and tot_base_co2 > Decimal("0.0"):
            savings_diff = tot_base_co2 - tot_eco_co2
            carbon_savings_pct = max(
                Decimal("0.0"),
                (savings_diff / tot_base_co2 * Decimal("100")).quantize(Decimal("0.1")),
            )

        return AnalyticsSummaryResponse(
            total_jobs=total_jobs,
            completed_jobs=completed_jobs,
            failed_jobs=failed_jobs,
            waiting_jobs=waiting_jobs,
            running_jobs=running_jobs,
            total_attempts=total_attempts,
            total_energy_kwh=Decimal(str(total_energy)).quantize(Decimal("0.000001")),
            total_co2eq_grams=Decimal(str(total_co2)).quantize(Decimal("0.0001")),
            avg_job_duration_seconds=Decimal(str(avg_duration)).quantize(Decimal("0.01")),
            counterfactual_carbon_reduction_pct=carbon_savings_pct,
            carbon_savings_pct_vs_baseline=carbon_savings_pct,
            sla_compliance_rate=sla_compliance,
            deferral_rate=deferral_rate,
            failure_rate=failure_rate,
            retry_rate=retry_rate,
        )

    async def list_audit_events(
        self,
        session: AsyncSession,
        event_type: Optional[str] = None,
        job_id: Optional[uuid.UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[AuditEvent], int]:
        """Lists immutable audit trail records with total count."""
        count_stmt = select(func.count(AuditEvent.id))
        query_stmt = (
            select(AuditEvent)
            .order_by(AuditEvent.event_timestamp.desc())
            .limit(limit)
            .offset(offset)
        )

        if event_type:
            count_stmt = count_stmt.where(AuditEvent.event_type == event_type)
            query_stmt = query_stmt.where(AuditEvent.event_type == event_type)
        if job_id:
            count_stmt = count_stmt.where(AuditEvent.job_id == job_id)
            query_stmt = query_stmt.where(AuditEvent.job_id == job_id)

        total_res = await session.execute(count_stmt)
        total_count = total_res.scalar() or 0

        events_res = await session.execute(query_stmt)
        events = list(events_res.scalars().all())

        return events, total_count
