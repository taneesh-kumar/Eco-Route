"""add assigned_region_id to jobs

Revision ID: 0002_assigned_region
Revises: 0001_initial_schema
Create Date: 2026-09-18 20:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002_assigned_region"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add assigned_region_id column with foreign key to regions(id)
    op.add_column(
        "jobs",
        sa.Column(
            "assigned_region_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("regions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_jobs_assigned_region_id",
        "jobs",
        ["assigned_region_id"],
    )

    # 2. Backfill existing jobs from their latest attempt if status is DISPATCHED, RUNNING, or COMPLETED
    op.execute(
        """
        UPDATE jobs j
        SET assigned_region_id = sub.region_id
        FROM (
            SELECT DISTINCT ON (job_id) job_id, region_id
            FROM job_attempts
            ORDER BY job_id, attempt_number DESC
        ) sub
        WHERE j.id = sub.job_id
          AND j.status IN ('DISPATCHED', 'RUNNING', 'COMPLETED')
          AND j.assigned_region_id IS NULL;
        """
    )


def downgrade() -> None:
    op.drop_index("ix_jobs_assigned_region_id", table_name="jobs")
    op.drop_column("jobs", "assigned_region_id")
