"""Add evidence evaluation layer.

Revision ID: 006_evidence_evaluation
Revises: 005_evidence_reminders
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "006_evidence_evaluation"
down_revision = "005_evidence_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "evidence_evaluations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("evaluation_version", sa.String(64), nullable=False, server_default="evidence-confidence-v1"),
        sa.Column("quality_score", sa.Float(), nullable=False),
        sa.Column("coverage_score", sa.Float(), nullable=False),
        sa.Column("context_score", sa.Float(), nullable=False),
        sa.Column("integrity_score", sa.Float(), nullable=False),
        sa.Column("final_confidence", sa.Float(), nullable=False),
        sa.Column("confidence_threshold", sa.Float(), nullable=False, server_default="85.0"),
        sa.Column("uncertainty_type", sa.String(64), nullable=True),
        sa.Column("uncertainty_severity", sa.String(32), nullable=True),
        sa.Column("uncertainty_reasons", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("recommended_action", sa.String(64), nullable=False, server_default="normal_review"),
        sa.Column("generated_request", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("component_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("evidence_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("model_version", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evidence_evaluations_submission_id", "evidence_evaluations", ["submission_id"])
    op.create_index("ix_evidence_evaluations_created_at", "evidence_evaluations", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_evidence_evaluations_created_at", table_name="evidence_evaluations")
    op.drop_index("ix_evidence_evaluations_submission_id", table_name="evidence_evaluations")
    op.drop_table("evidence_evaluations")
