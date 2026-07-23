"""Submission and review schemas."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORMModel


class SubmissionDraftCreate(BaseModel):
    crop_cycle_id: UUID
    growth_stage_id: Optional[UUID] = None
    farmer_observations: Optional[str] = Field(default=None, max_length=5000)
    capture_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    capture_lon: Optional[float] = Field(default=None, ge=-180, le=180)
    capture_accuracy_m: Optional[float] = Field(default=None, ge=0, le=100_000)
    capture_timestamp: Optional[datetime] = None
    device_id: Optional[str] = Field(default=None, max_length=128)
    offline_created: bool = False
    idempotency_key: str = Field(min_length=8, max_length=128)
    on_behalf_of_farmer_id: Optional[UUID] = None
    metadata_json: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def validate_capture(self):
        if (self.capture_lat is None) != (self.capture_lon is None):
            raise ValueError("capture_lat and capture_lon must be supplied together")
        if self.capture_timestamp:
            value = self.capture_timestamp
            if value.tzinfo is None:
                raise ValueError("capture_timestamp must include a timezone")
            if value > datetime.now(timezone.utc) + timedelta(minutes=5):
                raise ValueError("capture_timestamp cannot be in the future")
        return self


class ImageMetaIn(BaseModel):
    angle_type: str = Field(pattern="^(wide_field|mid_canopy|closeup_damage)$")
    sequence_order: int = Field(default=0, ge=0, le=100)
    content_type: str = Field(default="image/jpeg", pattern="^image/(jpeg|png|webp)$")
    byte_size: int = Field(gt=0, le=100 * 1024 * 1024)
    sha256: str = Field(pattern="^[0-9a-fA-F]{64}$")
    perceptual_hash: Optional[str] = Field(default=None, max_length=64)
    capture_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    capture_lon: Optional[float] = Field(default=None, ge=-180, le=180)
    capture_accuracy_m: Optional[float] = Field(default=None, ge=0, le=100_000)
    captured_at: Optional[datetime] = None
    width: Optional[int] = Field(default=None, gt=0, le=100_000)
    height: Optional[int] = Field(default=None, gt=0, le=100_000)
    orientation: Optional[str] = Field(default=None, max_length=32)
    device_model: Optional[str] = Field(default=None, max_length=128)
    client_checks: Optional[dict[str, Any]] = None
    quality_flags: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def validate_capture(self):
        if (self.capture_lat is None) != (self.capture_lon is None):
            raise ValueError("capture_lat and capture_lon must be supplied together")
        if self.captured_at and self.captured_at.tzinfo is None:
            raise ValueError("captured_at must include a timezone")
        return self


class UploadURLRequest(BaseModel):
    images: list[ImageMetaIn] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def unique_angles(self):
        angles = [image.angle_type for image in self.images]
        if len(angles) != len(set(angles)):
            raise ValueError("Each angle_type may appear only once per request")
        return self


class UploadURLItem(BaseModel):
    image_id: UUID
    angle_type: str
    object_key: str
    upload_url: Optional[str] = None
    method: str = "PUT"
    headers: dict[str, str] = Field(default_factory=dict)


class UploadURLResponse(BaseModel):
    submission_id: UUID
    uploads: list[UploadURLItem]


class ImageUploadedConfirm(BaseModel):
    image_id: UUID
    etag: Optional[str] = None


class FinalizeSubmissionRequest(BaseModel):
    farmer_observations: Optional[str] = Field(default=None, max_length=5000)


class SubmissionImageOut(ORMModel):
    id: UUID
    angle_type: str
    sequence_order: int
    upload_status: str
    sha256: Optional[str] = None
    object_key: Optional[str] = None
    download_url: Optional[str] = None
    quality_flags: Optional[dict[str, Any]] = None


class AIPredictionOut(ORMModel):
    id: UUID
    model_version: str
    adapter_type: str
    is_production_validated: bool
    predicted_crop: Optional[str] = None
    crop_confidence: Optional[float] = None
    predicted_growth_stage: Optional[str] = None
    growth_stage_confidence: Optional[float] = None
    predicted_grade: Optional[str] = None
    grade_label: Optional[str] = None
    grade_confidence: Optional[float] = None
    grade_scores: Optional[dict[str, Any]] = None
    damage_scores: Optional[dict[str, Any]] = None
    primary_damage: Optional[str] = None
    affected_area_pct: Optional[float] = None
    severity: Optional[str] = None
    overall_confidence: Optional[float] = None
    quality_warnings: Optional[list[Any]] = None
    anomaly_flags: Optional[list[Any]] = None
    human_review_recommendation: Optional[str] = None
    explanation: Optional[dict[str, Any]] = None
    processing_duration_ms: Optional[int] = None


class SubmissionOut(ORMModel):
    id: UUID
    crop_cycle_id: UUID
    submitted_by: UUID
    status: str
    growth_stage_id: Optional[UUID] = None
    on_behalf_of_farmer_id: Optional[UUID] = None
    capture_lat: Optional[float] = None
    capture_lon: Optional[float] = None
    capture_accuracy_m: Optional[float] = None
    capture_timestamp: Optional[datetime] = None
    farmer_observations: Optional[str] = None
    severity: Optional[str] = None
    final_severity: Optional[str] = None
    final_assessment_notes: Optional[str] = None
    offline_created: bool
    idempotency_key: str
    finalized_at: Optional[datetime] = None
    anomaly_flags: Optional[dict[str, Any]] = None
    images: list[SubmissionImageOut] = Field(default_factory=list)
    latest_prediction: Optional[AIPredictionOut] = None


class ReviewActionRequest(BaseModel):
    action: str = Field(
        pattern="^(accept|correct|reject|request_recapture|physical_inspection|inconclusive|complete)$"
    )
    override_reason: Optional[str] = Field(default=None, min_length=3, max_length=5000)
    corrected_crop: Optional[str] = Field(default=None, min_length=1, max_length=128)
    corrected_growth_stage: Optional[str] = Field(default=None, min_length=1, max_length=128)
    corrected_grade: Optional[str] = Field(default=None, pattern="^(A|B|C|U)$")
    corrected_damage_codes: Optional[list[str]] = Field(default=None, min_length=1, max_length=12)
    corrected_severity: Optional[str] = Field(default=None, pattern="^(none|low|medium|high|severe|critical)$")
    corrected_affected_area_pct: Optional[float] = Field(default=None, ge=0, le=100)
    notes: Optional[str] = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def validate_correction(self):
        if self.corrected_damage_codes and len(self.corrected_damage_codes) != len(set(self.corrected_damage_codes)):
            raise ValueError("corrected_damage_codes must be unique")
        correction_values = (
            self.corrected_crop,
            self.corrected_growth_stage,
            self.corrected_grade,
            self.corrected_damage_codes,
            self.corrected_severity,
            self.corrected_affected_area_pct,
        )
        if self.action == "correct" and not any(value is not None for value in correction_values):
            raise ValueError("correct requires at least one corrected value")
        return self


class MapMarkerOut(BaseModel):
    id: UUID
    lat: float
    lon: float
    status: str
    severity: Optional[str] = None
    crop_code: Optional[str] = None
    primary_damage: Optional[str] = None
    confidence: Optional[float] = None
    created_at: Optional[datetime] = None


class SyncPushItem(BaseModel):
    client_op_id: str = Field(min_length=8, max_length=128)
    operation_type: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any]


class SyncPushRequest(BaseModel):
    operations: list[SyncPushItem] = Field(min_length=1, max_length=100)


class SyncPushResult(BaseModel):
    client_op_id: str
    status: str
    server_entity_id: Optional[str] = None
    error_message: Optional[str] = None
