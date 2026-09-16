"""initial schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-09-17 00:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. regions
    op.create_table(
        "regions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("country", sa.String(length=100), nullable=False),
        sa.Column("latitude", sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column("longitude", sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column("max_cpu_capacity", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("max_memory_capacity", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("current_utilization", sa.Numeric(precision=5, scale=4), nullable=False, server_default="0.0"),
        sa.Column("performance_factor", sa.Numeric(precision=6, scale=4), nullable=False, server_default="1.0"),
        sa.Column("idle_power_watts", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("peak_power_watts", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("network_latency_ms", sa.Numeric(precision=8, scale=2), nullable=False, server_default="0.0"),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("max_cpu_capacity > 0", name="chk_regions_max_cpu_capacity_positive"),
        sa.CheckConstraint("max_memory_capacity > 0", name="chk_regions_max_memory_capacity_positive"),
        sa.CheckConstraint("current_utilization >= 0.0 AND current_utilization <= 1.0", name="chk_regions_current_utilization_range"),
        sa.CheckConstraint("performance_factor > 0", name="chk_regions_performance_factor_positive"),
        sa.CheckConstraint("idle_power_watts >= 0", name="chk_regions_idle_power_non_negative"),
        sa.CheckConstraint("peak_power_watts >= idle_power_watts", name="chk_regions_peak_power_gte_idle"),
        sa.CheckConstraint("network_latency_ms >= 0", name="chk_regions_network_latency_non_negative"),
    )
    op.create_index("ix_regions_code", "regions", ["code"], unique=True)
    op.create_index("ix_regions_availability", "regions", ["is_available", "is_active"])

    # 2. jobs
    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workload_name", sa.String(length=255), nullable=False),
        sa.Column("workload_type", sa.String(length=100), nullable=False),
        sa.Column("cpu_demand", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("memory_demand", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("base_execution_duration", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="PENDING"),
        sa.Column("current_attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_retries", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("cpu_demand > 0", name="chk_jobs_cpu_demand_positive"),
        sa.CheckConstraint("memory_demand > 0", name="chk_jobs_memory_demand_positive"),
        sa.CheckConstraint("base_execution_duration > 0", name="chk_jobs_base_execution_duration_positive"),
        sa.CheckConstraint("priority >= 1 AND priority <= 10", name="chk_jobs_priority_range"),
        sa.CheckConstraint(
            "status IN ('PENDING', 'EVALUATING', 'WAITING', 'DISPATCHED', 'RUNNING', 'COMPLETED', 'FAILED')",
            name="chk_jobs_valid_status",
        ),
        sa.CheckConstraint("current_attempt_count >= 0", name="chk_jobs_current_attempt_count_non_negative"),
        sa.CheckConstraint("max_retries >= 0", name="chk_jobs_max_retries_non_negative"),
    )
    op.create_index("ix_jobs_status_deadline", "jobs", ["status", "deadline"])

    # 3. job_attempts
    op.create_table(
        "job_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("region_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("regions.id"), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="PENDING"),
        sa.Column("claimed_by_worker", sa.String(length=255), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_duration", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("actual_energy_kwh", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("actual_co2eq_grams", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("job_id", "attempt_number", name="uq_job_attempts_job_attempt"),
        sa.CheckConstraint("attempt_number >= 1", name="chk_job_attempts_attempt_number_positive"),
        sa.CheckConstraint(
            "status IN ('PENDING', 'CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED')",
            name="chk_job_attempts_valid_status",
        ),
    )
    op.create_index("ix_job_attempts_job_id", "job_attempts", ["job_id"])
    op.create_index("ix_job_attempts_region_id", "job_attempts", ["region_id"])
    op.create_index("ix_job_attempts_status", "job_attempts", ["status"])

    # 4. carbon_observations
    op.create_table(
        "carbon_observations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("region_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("regions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("carbon_intensity", sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("data_quality", sa.String(length=50), nullable=False),
        sa.Column("observation_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(data_quality = 'UNAVAILABLE' AND carbon_intensity IS NULL) OR "
            "(data_quality != 'UNAVAILABLE' AND carbon_intensity IS NOT NULL)",
            name="chk_carbon_obs_zero_fabrication",
        ),
        sa.CheckConstraint("carbon_intensity IS NULL OR carbon_intensity >= 0", name="chk_carbon_intensity_non_negative"),
        sa.CheckConstraint("data_quality IN ('LIVE', 'CACHED', 'UNAVAILABLE')", name="chk_carbon_obs_valid_quality"),
        sa.CheckConstraint("source IN ('ELECTRICITY_MAPS', 'REGIONAL_PROFILE')", name="chk_carbon_obs_valid_source"),
        sa.CheckConstraint("valid_until >= observation_timestamp", name="chk_carbon_obs_valid_until_gte_obs"),
    )
    op.create_index(
        "ix_carbon_observations_region_time",
        "carbon_observations",
        ["region_id", sa.text("observation_timestamp DESC")],
    )

    # 5. scheduling_decisions
    op.create_table(
        "scheduling_decisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("job_attempts.id"), nullable=True),
        sa.Column("selected_region_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("regions.id"), nullable=True),
        sa.Column("decision_action", sa.String(length=50), nullable=False),
        sa.Column("cost_score_jr", sa.Numeric(precision=8, scale=6), nullable=True),
        sa.Column("estimated_energy_kwh", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("estimated_co2eq_grams", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("carbon_source_used", sa.String(length=100), nullable=False),
        sa.Column("carbon_quality_used", sa.String(length=50), nullable=False),
        sa.Column("decision_reason", sa.Text(), nullable=False),
        sa.Column("score_breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("candidate_rankings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("applied_weights", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("normalization_factors", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "decision_action IN ('EXECUTE', 'DEFER', 'REJECT')",
            name="chk_scheduling_decisions_valid_action",
        ),
    )
    op.create_index(
        "ix_scheduling_decisions_job_time",
        "scheduling_decisions",
        ["job_id", sa.text("created_at DESC")],
    )

    # 6. experiments
    op.create_table(
        "experiments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("scheduler_variant", sa.String(length=50), nullable=False),
        sa.Column("random_seed", sa.Integer(), nullable=False),
        sa.Column("scenario_type", sa.String(length=100), nullable=False),
        sa.Column("workload_configuration", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("region_configuration", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="PENDING"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "scheduler_variant IN ('CONVENTIONAL', 'RANDOM', 'CARBON_ONLY', 'PERFORMANCE_ONLY', 'ECOROUTE')",
            name="chk_experiments_valid_scheduler_variant",
        ),
        sa.CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')",
            name="chk_experiments_valid_status",
        ),
    )

    # 7. experiment_results
    op.create_table(
        "experiment_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("experiment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scheduler_algorithm", sa.String(length=50), nullable=False),
        sa.Column("total_energy_kwh", sa.Numeric(precision=12, scale=6), nullable=False),
        sa.Column("total_co2eq_grams", sa.Numeric(precision=12, scale=4), nullable=False),
        sa.Column("avg_execution_time_seconds", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("avg_latency_ms", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("deadline_compliance_rate", sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column("failure_rate", sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column("retry_rate", sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column("duplicate_execution_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deferral_rate", sa.Numeric(precision=5, scale=4), nullable=False, server_default="0.0"),
        sa.Column("avg_region_utilization", sa.Numeric(precision=5, scale=4), nullable=False, server_default="0.0"),
        sa.Column("detailed_metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "deadline_compliance_rate >= 0.0 AND deadline_compliance_rate <= 1.0",
            name="chk_exp_results_deadline_compliance_range",
        ),
        sa.CheckConstraint(
            "failure_rate >= 0.0 AND failure_rate <= 1.0",
            name="chk_exp_results_failure_rate_range",
        ),
        sa.CheckConstraint("retry_rate >= 0.0", name="chk_exp_results_retry_rate_non_negative"),
        sa.CheckConstraint("duplicate_execution_count >= 0", name="chk_exp_results_duplicate_count_non_negative"),
        sa.CheckConstraint("deferral_rate >= 0.0 AND deferral_rate <= 1.0", name="chk_exp_results_deferral_rate_range"),
        sa.CheckConstraint(
            "avg_region_utilization >= 0.0 AND avg_region_utilization <= 1.0",
            name="chk_exp_results_avg_utilization_range",
        ),
    )
    op.create_index("ix_experiment_results_experiment_id", "experiment_results", ["experiment_id"])

    # 8. audit_events
    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("job_attempts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("actor", sa.String(length=100), nullable=False),
        sa.Column("event_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("event_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_audit_events_job_time",
        "audit_events",
        ["job_id", sa.text("event_timestamp DESC")],
    )


def downgrade() -> None:
    op.drop_table("audit_events")
    op.drop_table("experiment_results")
    op.drop_table("experiments")
    op.drop_table("scheduling_decisions")
    op.drop_table("carbon_observations")
    op.drop_table("job_attempts")
    op.drop_table("jobs")
    op.drop_table("regions")
