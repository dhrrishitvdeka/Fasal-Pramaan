"""Add recurring evidence reminders and five-photo context angles.

Revision ID: 005_evidence_reminders
Revises: 004_crop_health_grade
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "005_evidence_reminders"
down_revision = "004_crop_health_grade"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "evidence_reminder_plans",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("crop_cycle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crop_cycles.id"), nullable=False),
        sa.Column("cadence_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("target_photos", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("reminder_lead_days", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("timezone_name", sa.String(64), nullable=False, server_default="Asia/Kolkata"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("next_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "crop_cycle_id", name="uq_evidence_reminder_user_cycle"),
        sa.CheckConstraint("cadence_days BETWEEN 14 AND 90", name="ck_evidence_reminder_cadence"),
        sa.CheckConstraint("target_photos BETWEEN 4 AND 5", name="ck_evidence_reminder_photos"),
        sa.CheckConstraint("reminder_lead_days BETWEEN 0 AND 7", name="ck_evidence_reminder_lead"),
    )
    op.create_index("ix_evidence_reminder_plans_user_id", "evidence_reminder_plans", ["user_id"])
    op.create_index("ix_evidence_reminder_plans_crop_cycle_id", "evidence_reminder_plans", ["crop_cycle_id"])
    op.create_index("ix_evidence_reminders_due", "evidence_reminder_plans", ["is_active", "next_due_at"])
    op.drop_constraint("ck_submission_images_angle", "submission_images", type_="check")
    op.create_check_constraint(
        "ck_submission_images_angle",
        "submission_images",
        "angle_type IN ('wide_field','left_context','mid_canopy','right_context','closeup_damage')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_submission_images_angle", "submission_images", type_="check")
    op.create_check_constraint(
        "ck_submission_images_angle",
        "submission_images",
        "angle_type IN ('wide_field','mid_canopy','closeup_damage')",
    )
    op.drop_index("ix_evidence_reminders_due", table_name="evidence_reminder_plans")
    op.drop_index("ix_evidence_reminder_plans_crop_cycle_id", table_name="evidence_reminder_plans")
    op.drop_index("ix_evidence_reminder_plans_user_id", table_name="evidence_reminder_plans")
    op.drop_table("evidence_reminder_plans")
