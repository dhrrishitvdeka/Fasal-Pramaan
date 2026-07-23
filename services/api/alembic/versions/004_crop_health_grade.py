"""Add presentation crop-health screening grade fields.

Revision ID: 004_crop_health_grade
Revises: 003_session_security
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "004_crop_health_grade"
down_revision = "003_session_security"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_predictions", sa.Column("predicted_grade", sa.String(8), nullable=True))
    op.add_column("ai_predictions", sa.Column("grade_label", sa.String(64), nullable=True))
    op.add_column("ai_predictions", sa.Column("grade_confidence", sa.Float(), nullable=True))
    op.add_column(
        "ai_predictions",
        sa.Column("grade_scores", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("human_reviews", sa.Column("corrected_grade", sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column("human_reviews", "corrected_grade")
    op.drop_column("ai_predictions", "grade_scores")
    op.drop_column("ai_predictions", "grade_confidence")
    op.drop_column("ai_predictions", "grade_label")
    op.drop_column("ai_predictions", "predicted_grade")
