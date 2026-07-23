"""Add integrity constraints and indexes required by the domain models.

Revision ID: 002_integrity_hardening
Revises: 001
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "002_integrity_hardening"
down_revision = "001"
branch_labels = None
depends_on = None


INDEXES = (
    ("ix_ai_jobs_submission_id", "ai_jobs", ["submission_id"]),
    ("ix_ai_predictions_ai_job_id", "ai_predictions", ["ai_job_id"]),
    ("ix_ai_predictions_submission_id", "ai_predictions", ["submission_id"]),
    ("ix_alerts_alert_type", "alerts", ["alert_type"]),
    ("ix_audit_logs_created_at", "audit_logs", ["created_at"]),
    ("ix_crop_cycles_plot_id", "crop_cycles", ["plot_id"]),
    ("ix_damage_assessments_submission_id", "damage_assessments", ["submission_id"]),
    ("ix_device_records_device_id", "device_records", ["device_id"]),
    ("ix_farms_farmer_id", "farms", ["farmer_id"]),
    ("ix_human_reviews_submission_id", "human_reviews", ["submission_id"]),
    ("ix_notifications_user_id", "notifications", ["user_id"]),
    ("ix_plots_farm_id", "plots", ["farm_id"]),
    ("ix_recapture_requests_submission_id", "recapture_requests", ["submission_id"]),
    ("ix_submission_images_perceptual_hash", "submission_images", ["perceptual_hash"]),
    ("ix_submission_images_sha256", "submission_images", ["sha256"]),
    ("ix_submission_images_submission_id", "submission_images", ["submission_id"]),
    ("ix_submissions_crop_cycle_id", "submissions", ["crop_cycle_id"]),
    ("ix_submissions_submitted_by", "submissions", ["submitted_by"]),
    ("ix_sync_operations_user_id", "sync_operations", ["user_id"]),
    ("ix_users_phone", "users", ["phone"]),
)


def upgrade() -> None:
    op.add_column("human_reviews", sa.Column("corrected_affected_area_pct", sa.Float(), nullable=True))
    # The original migration created both a unique constraint and a redundant
    # non-unique email index. The constraint already supplies the lookup index.
    op.drop_index("ix_users_email", table_name="users")
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns)

    op.create_index(
        "uq_damage_assessments_one_final",
        "damage_assessments",
        ["submission_id"],
        unique=True,
        postgresql_where=sa.text("is_final"),
    )

    op.create_check_constraint(
        "ck_submissions_status",
        "submissions",
        "status IN ('draft','queued','uploading','uploaded','processing','needs_recapture','pending_review','verified','failed','cancelled','physical_inspection','rejected')",
    )
    op.create_check_constraint("ck_submissions_lat", "submissions", "capture_lat IS NULL OR capture_lat BETWEEN -90 AND 90")
    op.create_check_constraint("ck_submissions_lon", "submissions", "capture_lon IS NULL OR capture_lon BETWEEN -180 AND 180")
    op.create_check_constraint("ck_submissions_accuracy", "submissions", "capture_accuracy_m IS NULL OR capture_accuracy_m >= 0")
    op.create_check_constraint(
        "ck_submission_images_angle",
        "submission_images",
        "angle_type IN ('wide_field','mid_canopy','closeup_damage')",
    )
    op.create_check_constraint(
        "ck_submission_images_status",
        "submission_images",
        "upload_status IN ('pending','uploading','uploaded','failed')",
    )
    op.create_check_constraint("ck_submission_images_size", "submission_images", "byte_size IS NULL OR byte_size > 0")
    op.create_check_constraint(
        "ck_ai_jobs_status",
        "ai_jobs",
        "status IN ('queued','running','completed','failed','retrying')",
    )
    op.create_check_constraint("ck_ai_jobs_attempt", "ai_jobs", "attempt >= 0")
    op.create_check_constraint(
        "ck_ai_predictions_confidence",
        "ai_predictions",
        "overall_confidence IS NULL OR overall_confidence BETWEEN 0 AND 1",
    )
    op.create_check_constraint(
        "ck_ai_predictions_area",
        "ai_predictions",
        "affected_area_pct IS NULL OR affected_area_pct BETWEEN 0 AND 100",
    )
    op.create_check_constraint(
        "ck_damage_assessments_area",
        "damage_assessments",
        "affected_area_pct IS NULL OR affected_area_pct BETWEEN 0 AND 100",
    )
    op.create_check_constraint(
        "ck_damage_assessments_confidence",
        "damage_assessments",
        "confidence IS NULL OR confidence BETWEEN 0 AND 1",
    )
    op.create_check_constraint(
        "ck_human_reviews_area",
        "human_reviews",
        "corrected_affected_area_pct IS NULL OR corrected_affected_area_pct BETWEEN 0 AND 100",
    )


def downgrade() -> None:
    for constraint, table in (
        ("ck_human_reviews_area", "human_reviews"),
        ("ck_damage_assessments_confidence", "damage_assessments"),
        ("ck_damage_assessments_area", "damage_assessments"),
        ("ck_ai_predictions_area", "ai_predictions"),
        ("ck_ai_predictions_confidence", "ai_predictions"),
        ("ck_ai_jobs_attempt", "ai_jobs"),
        ("ck_ai_jobs_status", "ai_jobs"),
        ("ck_submission_images_size", "submission_images"),
        ("ck_submission_images_status", "submission_images"),
        ("ck_submission_images_angle", "submission_images"),
        ("ck_submissions_accuracy", "submissions"),
        ("ck_submissions_lon", "submissions"),
        ("ck_submissions_lat", "submissions"),
        ("ck_submissions_status", "submissions"),
    ):
        op.drop_constraint(constraint, table, type_="check")
    op.drop_index("uq_damage_assessments_one_final", table_name="damage_assessments")
    for name, table, _ in reversed(INDEXES):
        op.drop_index(name, table_name=table)
    op.create_index("ix_users_email", "users", ["email"])
    op.drop_column("human_reviews", "corrected_affected_area_pct")
