"""Initial FasalPramaan schema with PostGIS.

Revision ID: 001
Revises:
Create Date: 2026-07-17
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography, Geometry
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "jurisdictions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("name_hi", sa.String(255), nullable=True),
        sa.Column("level", sa.String(32), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id"), nullable=True),
        sa.Column("boundary", Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True),
        sa.Column("centroid", Geography(geometry_type="POINT", srid=4326), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("preferred_language", sa.String(16), nullable=False, server_default="en"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "user_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(128), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("device_id", sa.String(128), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "farmer_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("farmer_code", sa.String(64), unique=True, nullable=False),
        sa.Column("village_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id"), nullable=True),
        sa.Column("aadhaar_last4", sa.String(4), nullable=True),
        sa.Column("address_line", sa.String(512), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "field_officer_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("employee_code", sa.String(64), unique=True, nullable=False),
        sa.Column("jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id"), nullable=True),
        sa.Column("designation", sa.String(128), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "crop_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("name_hi", sa.String(128), nullable=True),
        sa.Column("scientific_name", sa.String(255), nullable=True),
        sa.Column("season", sa.String(64), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "crop_varieties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("crop_type_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crop_types.id"), nullable=False),
        sa.Column("code", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "growth_stages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("crop_type_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crop_types.id"), nullable=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("name_hi", sa.String(128), nullable=True),
        sa.Column("sequence_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("typical_day_start", sa.Integer(), nullable=True),
        sa.Column("typical_day_end", sa.Integer(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("crop_type_id", "code", name="uq_growth_stage_crop_code"),
    )

    op.create_table(
        "farms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("farmer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("farmer_profiles.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("village_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id"), nullable=True),
        sa.Column("total_area_hectares", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "plots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("farm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("farms.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("survey_number", sa.String(64), nullable=True),
        sa.Column("area_hectares", sa.Float(), nullable=True),
        sa.Column("boundary", Geography(geometry_type="POLYGON", srid=4326), nullable=True),
        sa.Column("centroid", Geography(geometry_type="POINT", srid=4326), nullable=True),
        sa.Column("soil_type", sa.String(64), nullable=True),
        sa.Column("irrigation_type", sa.String(64), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "crop_cycles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("plot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plots.id"), nullable=False),
        sa.Column("crop_type_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crop_types.id"), nullable=False),
        sa.Column("crop_variety_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crop_varieties.id"), nullable=True),
        sa.Column("season_year", sa.Integer(), nullable=False),
        sa.Column("season", sa.String(32), nullable=False),
        sa.Column("sowing_date", sa.Date(), nullable=True),
        sa.Column("expected_harvest_date", sa.Date(), nullable=True),
        sa.Column("current_growth_stage_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("growth_stages.id"), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("insurance_policy_ref", sa.String(128), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "device_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("device_id", sa.String(128), nullable=False),
        sa.Column("platform", sa.String(32), nullable=False),
        sa.Column("model", sa.String(128), nullable=True),
        sa.Column("os_version", sa.String(64), nullable=True),
        sa.Column("app_version", sa.String(32), nullable=True),
        sa.Column("push_token", sa.String(512), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "device_id", name="uq_user_device"),
    )

    op.create_table(
        "submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("crop_cycle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crop_cycles.id"), nullable=False),
        sa.Column("submitted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("on_behalf_of_farmer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("farmer_profiles.id"), nullable=True),
        sa.Column("growth_stage_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("growth_stages.id"), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("capture_location", Geography(geometry_type="POINT", srid=4326), nullable=True),
        sa.Column("capture_lat", sa.Float(), nullable=True),
        sa.Column("capture_lon", sa.Float(), nullable=True),
        sa.Column("capture_accuracy_m", sa.Float(), nullable=True),
        sa.Column("capture_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("farmer_observations", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("device_id", sa.String(128), nullable=True),
        sa.Column("offline_created", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("severity", sa.String(32), nullable=True),
        sa.Column("final_severity", sa.String(32), nullable=True),
        sa.Column("final_assessment_notes", sa.Text(), nullable=True),
        sa.Column("anomaly_flags", postgresql.JSONB(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_submissions_status", "submissions", ["status"])
    op.create_index("ix_submissions_idempotency", "submissions", ["idempotency_key"], unique=True)

    op.create_table(
        "submission_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("angle_type", sa.String(64), nullable=False),
        sa.Column("sequence_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("object_key", sa.String(512), nullable=True),
        sa.Column("content_type", sa.String(128), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("perceptual_hash", sa.String(64), nullable=True),
        sa.Column("upload_status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("capture_lat", sa.Float(), nullable=True),
        sa.Column("capture_lon", sa.Float(), nullable=True),
        sa.Column("capture_accuracy_m", sa.Float(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("quality_flags", postgresql.JSONB(), nullable=True),
        sa.Column("is_original_immutable", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "image_metadata",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submission_images.id"), unique=True, nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("orientation", sa.String(32), nullable=True),
        sa.Column("device_model", sa.String(128), nullable=True),
        sa.Column("exif_json", postgresql.JSONB(), nullable=True),
        sa.Column("blur_score", sa.Float(), nullable=True),
        sa.Column("brightness_score", sa.Float(), nullable=True),
        sa.Column("client_checks", postgresql.JSONB(), nullable=True),
        sa.Column("server_checks", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "model_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("adapter_type", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_production_validated", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("name", "version", name="uq_model_name_version"),
    )

    op.create_table(
        "damage_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("name_hi", sa.String(128), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("severity_default", sa.String(32), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "ai_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("model_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("model_versions.id"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("celery_task_id", sa.String(128), nullable=True),
        sa.Column("attempt", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "ai_predictions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ai_job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_jobs.id"), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submission_images.id"), nullable=True),
        sa.Column("model_version", sa.String(64), nullable=False),
        sa.Column("adapter_type", sa.String(64), nullable=False),
        sa.Column("is_production_validated", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("predicted_crop", sa.String(128), nullable=True),
        sa.Column("crop_confidence", sa.Float(), nullable=True),
        sa.Column("predicted_growth_stage", sa.String(128), nullable=True),
        sa.Column("growth_stage_confidence", sa.Float(), nullable=True),
        sa.Column("damage_scores", postgresql.JSONB(), nullable=True),
        sa.Column("primary_damage", sa.String(64), nullable=True),
        sa.Column("affected_area_pct", sa.Float(), nullable=True),
        sa.Column("severity", sa.String(32), nullable=True),
        sa.Column("overall_confidence", sa.Float(), nullable=True),
        sa.Column("quality_warnings", postgresql.JSONB(), nullable=True),
        sa.Column("anomaly_flags", postgresql.JSONB(), nullable=True),
        sa.Column("human_review_recommendation", sa.String(64), nullable=True),
        sa.Column("explanation", postgresql.JSONB(), nullable=True),
        sa.Column("raw_response", postgresql.JSONB(), nullable=True),
        sa.Column("processing_duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "damage_assessments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("primary_damage_code", sa.String(64), nullable=True),
        sa.Column("damage_codes", postgresql.JSONB(), nullable=True),
        sa.Column("severity", sa.String(32), nullable=True),
        sa.Column("affected_area_pct", sa.Float(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("assessed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("is_final", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "human_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("override_reason", sa.Text(), nullable=True),
        sa.Column("corrected_crop", sa.String(128), nullable=True),
        sa.Column("corrected_growth_stage", sa.String(128), nullable=True),
        sa.Column("corrected_damage_codes", postgresql.JSONB(), nullable=True),
        sa.Column("corrected_severity", sa.String(32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("ai_prediction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_predictions.id"), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "recapture_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("required_angles", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="open"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("alert_type", sa.String(64), nullable=False),
        sa.Column("severity", sa.String(32), nullable=False, server_default="info"),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("jurisdiction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jurisdictions.id"), nullable=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("is_acknowledged", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("acknowledged_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("title_hi", sa.String(255), nullable=True),
        sa.Column("body_hi", sa.Text(), nullable=True),
        sa.Column("channel", sa.String(32), nullable=False, server_default="in_app"),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("related_submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.String(64), nullable=True),
        sa.Column("before_json", postgresql.JSONB(), nullable=True),
        sa.Column("after_json", postgresql.JSONB(), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("correlation_id", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_audit_entity", "audit_logs", ["entity_type", "entity_id"])

    op.create_table(
        "system_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(128), unique=True, nullable=False),
        sa.Column("value_json", postgresql.JSONB(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "sync_operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("client_op_id", sa.String(128), nullable=False),
        sa.Column("operation_type", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="received"),
        sa.Column("server_entity_id", sa.String(64), nullable=True),
        sa.Column("conflict_json", postgresql.JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "client_op_id", name="uq_sync_user_op"),
    )


def downgrade() -> None:
    for table in [
        "sync_operations",
        "system_settings",
        "audit_logs",
        "notifications",
        "alerts",
        "recapture_requests",
        "human_reviews",
        "damage_assessments",
        "ai_predictions",
        "ai_jobs",
        "damage_categories",
        "model_versions",
        "image_metadata",
        "submission_images",
        "submissions",
        "device_records",
        "crop_cycles",
        "plots",
        "farms",
        "growth_stages",
        "crop_varieties",
        "crop_types",
        "field_officer_profiles",
        "farmer_profiles",
        "refresh_tokens",
        "user_roles",
        "users",
        "jurisdictions",
        "roles",
    ]:
        op.drop_table(table)
