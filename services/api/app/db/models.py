"""Normalized domain models for FasalPramaan AI."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Optional

from geoalchemy2 import Geography, Geometry
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin, VersionMixin, utcnow


# ---------------------------------------------------------------------------
# Auth & users
# ---------------------------------------------------------------------------


class Role(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "roles"

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    preferred_language: Mapped[str] = mapped_column(String(16), default="en", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    roles: Mapped[list["UserRole"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    farmer_profile: Mapped[Optional["FarmerProfile"]] = relationship(back_populates="user", uselist=False)
    field_officer_profile: Mapped[Optional["FieldOfficerProfile"]] = relationship(
        back_populates="user", uselist=False
    )


class UserRole(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id", name="uq_user_role"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    jurisdiction_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jurisdictions.id"), nullable=True
    )

    user: Mapped[User] = relationship(back_populates="roles")
    role: Mapped[Role] = relationship()
    jurisdiction: Mapped[Optional["Jurisdiction"]] = relationship()


class RefreshToken(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, nullable=False, index=True)
    replaced_by_token_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    device_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)


# ---------------------------------------------------------------------------
# Jurisdictions
# ---------------------------------------------------------------------------


class Jurisdiction(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "jurisdictions"

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    name_hi: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    level: Mapped[str] = mapped_column(String(32), nullable=False)  # state|district|block|village
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jurisdictions.id"), nullable=True
    )
    boundary = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True)
    centroid = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=True)

    parent: Mapped[Optional["Jurisdiction"]] = relationship(remote_side="Jurisdiction.id")


class FarmerProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "farmer_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    farmer_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    village_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jurisdictions.id"), nullable=True
    )
    aadhaar_last4: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    address_line: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    user: Mapped[User] = relationship(back_populates="farmer_profile")
    village: Mapped[Optional[Jurisdiction]] = relationship()


class FieldOfficerProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "field_officer_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    employee_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    jurisdiction_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jurisdictions.id"), nullable=True
    )
    designation: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    user: Mapped[User] = relationship(back_populates="field_officer_profile")
    jurisdiction: Mapped[Optional[Jurisdiction]] = relationship()


# ---------------------------------------------------------------------------
# Farms, plots, crops
# ---------------------------------------------------------------------------


class Farm(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "farms"

    farmer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farmer_profiles.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    village_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jurisdictions.id"), nullable=True
    )
    total_area_hectares: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    farmer: Mapped[FarmerProfile] = relationship()
    plots: Mapped[list["Plot"]] = relationship(back_populates="farm")


class Plot(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "plots"

    farm_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farms.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    survey_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    area_hectares: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    boundary = mapped_column(Geography(geometry_type="POLYGON", srid=4326), nullable=True)
    centroid = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=True)
    soil_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    irrigation_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    farm: Mapped[Farm] = relationship(back_populates="plots")
    crop_cycles: Mapped[list["CropCycle"]] = relationship(back_populates="plot")


class CropType(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "crop_types"

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    name_hi: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    scientific_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    season: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # kharif|rabi|zaid


class CropVariety(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "crop_varieties"

    crop_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_types.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    duration_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    crop_type: Mapped[CropType] = relationship()


class GrowthStage(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "growth_stages"

    crop_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_types.id"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    name_hi: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    sequence_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    typical_day_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    typical_day_end: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    __table_args__ = (UniqueConstraint("crop_type_id", "code", name="uq_growth_stage_crop_code"),)


class CropCycle(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "crop_cycles"

    plot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plots.id"), nullable=False, index=True
    )
    crop_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_types.id"), nullable=False
    )
    crop_variety_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_varieties.id"), nullable=True
    )
    season_year: Mapped[int] = mapped_column(Integer, nullable=False)
    season: Mapped[str] = mapped_column(String(32), nullable=False)
    sowing_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expected_harvest_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    current_growth_stage_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("growth_stages.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    insurance_policy_ref: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    plot: Mapped[Plot] = relationship(back_populates="crop_cycles")
    crop_type: Mapped[CropType] = relationship()
    crop_variety: Mapped[Optional[CropVariety]] = relationship()
    current_growth_stage: Mapped[Optional[GrowthStage]] = relationship()


# ---------------------------------------------------------------------------
# Devices, submissions, images
# ---------------------------------------------------------------------------


class DeviceRecord(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "device_records"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    device_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    os_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    app_version: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    push_token: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "device_id", name="uq_user_device"),)


class Submission(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "submissions"
    __table_args__ = (
        Index("ix_submissions_status", "status"),
        Index("ix_submissions_idempotency", "idempotency_key", unique=True),
    )

    crop_cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_cycles.id"), nullable=False, index=True
    )
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    on_behalf_of_farmer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farmer_profiles.id"), nullable=True
    )
    growth_stage_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("growth_stages.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    # draft|queued|uploading|uploaded|processing|needs_recapture|pending_review|
    # verified|failed|cancelled|physical_inspection
    capture_location = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=True)
    capture_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    capture_lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    capture_accuracy_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    capture_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    farmer_observations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    device_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    offline_created: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    finalized_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    final_severity: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    final_assessment_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    anomaly_flags: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    metadata_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    crop_cycle: Mapped[CropCycle] = relationship()
    images: Mapped[list["SubmissionImage"]] = relationship(back_populates="submission")
    ai_jobs: Mapped[list["AIJob"]] = relationship(back_populates="submission")
    reviews: Mapped[list["HumanReview"]] = relationship(back_populates="submission")


class SubmissionImage(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "submission_images"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id"), nullable=False, index=True
    )
    angle_type: Mapped[str] = mapped_column(String(64), nullable=False)
    # wide_field|mid_canopy|closeup_damage
    sequence_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    object_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    byte_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    perceptual_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    upload_status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    # pending|uploading|uploaded|failed
    capture_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    capture_lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    capture_accuracy_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    captured_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    quality_flags: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    is_original_immutable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    submission: Mapped[Submission] = relationship(back_populates="images")
    image_metadata: Mapped[Optional["ImageMetadata"]] = relationship(
        back_populates="image", uselist=False
    )


class ImageMetadata(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "image_metadata"

    image_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submission_images.id"), unique=True, nullable=False
    )
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    orientation: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    device_model: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    exif_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    blur_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    brightness_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    client_checks: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    server_checks: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    image: Mapped[SubmissionImage] = relationship(back_populates="image_metadata")


# ---------------------------------------------------------------------------
# AI & review
# ---------------------------------------------------------------------------


class ModelVersion(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "model_versions"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    adapter_type: Mapped[str] = mapped_column(String(64), nullable=False)  # mock|baseline
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_production_validated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    metadata_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (UniqueConstraint("name", "version", name="uq_model_name_version"),)


class DamageCategory(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "damage_categories"

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    name_hi: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity_default: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class AIJob(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "ai_jobs"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False)
    # queued|running|completed|failed|retrying
    model_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("model_versions.id"), nullable=True
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    submission: Mapped[Submission] = relationship(back_populates="ai_jobs")
    predictions: Mapped[list["AIPrediction"]] = relationship(back_populates="ai_job")


class AIPrediction(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "ai_predictions"

    ai_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_jobs.id"), nullable=False, index=True
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id"), nullable=False, index=True
    )
    image_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submission_images.id"), nullable=True
    )
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    adapter_type: Mapped[str] = mapped_column(String(64), nullable=False)
    is_production_validated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    predicted_crop: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    crop_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    predicted_growth_stage: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    growth_stage_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    predicted_grade: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    grade_label: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    grade_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grade_scores: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    damage_scores: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    primary_damage: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    affected_area_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    overall_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    quality_warnings: Mapped[Optional[list[Any]]] = mapped_column(JSONB, nullable=True)
    anomaly_flags: Mapped[Optional[list[Any]]] = mapped_column(JSONB, nullable=True)
    human_review_recommendation: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    explanation: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    raw_response: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    processing_duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Never overwritten by human review — immutable AI record

    ai_job: Mapped[AIJob] = relationship(back_populates="predictions")


class DamageAssessment(Base, UUIDPrimaryKeyMixin, TimestampMixin, VersionMixin):
    __tablename__ = "damage_assessments"
    __table_args__ = (
        Index(
            "uq_damage_assessments_one_final",
            "submission_id",
            unique=True,
            postgresql_where=text("is_final"),
        ),
    )

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(32), nullable=False)  # ai|human|merged
    primary_damage_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    damage_codes: Mapped[Optional[list[Any]]] = mapped_column(JSONB, nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    affected_area_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assessed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    is_final: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class HumanReview(Base, UUIDPrimaryKeyMixin, TimestampMixin, VersionMixin):
    __tablename__ = "human_reviews"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id"), nullable=False, index=True
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    # accept|correct|reject|request_recapture|physical_inspection|inconclusive|complete
    override_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    corrected_crop: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    corrected_growth_stage: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    corrected_grade: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    corrected_damage_codes: Mapped[Optional[list[Any]]] = mapped_column(JSONB, nullable=True)
    corrected_severity: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    corrected_affected_area_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_prediction_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_predictions.id"), nullable=True
    )

    submission: Mapped[Submission] = relationship(back_populates="reviews")


class RecaptureRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "recapture_requests"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id"), nullable=False, index=True
    )
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    required_angles: Mapped[Optional[list[Any]]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="open", nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Alerts, notifications, audit, settings, sync
# ---------------------------------------------------------------------------


class Alert(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "alerts"

    alert_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(32), default="info", nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    jurisdiction_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jurisdictions.id"), nullable=True
    )
    submission_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id"), nullable=True
    )
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    acknowledged_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class Notification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    title_hi: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    body_hi: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    channel: Mapped[str] = mapped_column(String(32), default="in_app", nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    related_submission_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id"), nullable=True
    )


class AuditLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_entity", "entity_type", "entity_id"),)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    before_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    after_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    correlation_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class SystemSetting(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    value_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class SyncOperation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "sync_operations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    client_op_id: Mapped[str] = mapped_column(String(128), nullable=False)
    operation_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="received", nullable=False)
    server_entity_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    conflict_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "client_op_id", name="uq_sync_user_op"),)
