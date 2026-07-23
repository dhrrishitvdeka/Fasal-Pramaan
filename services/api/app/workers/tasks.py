"""Background tasks: AI processing pipeline."""

from __future__ import annotations

import base64
import io
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from PIL import Image
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.db.models import AIJob, AIPrediction, Alert, CropCycle, CropType, DamageAssessment, Submission
from app.db.session import SessionLocal
from app.services.notifications import notify_user
from app.services.rules import decide_review_path
from app.services.storage import get_bytes
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


class RetryableAIServiceError(RuntimeError):
    """Transient AI transport or availability failure eligible for Celery retry."""


def process_submission_ai_sync(
    submission_id: str,
    job_id: str,
    *,
    defer_retryable_failure: bool = False,
) -> dict[str, Any]:
    """Synchronous processing used by Celery and inline fallback."""
    db: Session = SessionLocal()
    settings = get_settings()
    try:
        job = db.query(AIJob).filter(AIJob.id == job_id).with_for_update().first()
        sub = (
            db.query(Submission)
            .options(joinedload(Submission.images))
            .filter(Submission.id == submission_id)
            .first()
        )
        if not job or not sub:
            return {"error": "not_found"}

        if job.status in {"running", "completed"}:
            return {"status": "duplicate_ignored", "job_id": str(job.id)}

        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        sub.status = "processing"
        db.commit()

        cycle = db.query(CropCycle).filter(CropCycle.id == sub.crop_cycle_id).first()
        crop_code = None
        if cycle:
            ct = db.query(CropType).filter(CropType.id == cycle.crop_type_id).first()
            crop_code = ct.code if ct else None



        image_payloads = []
        for img in sub.images:
            if getattr(img, "is_deleted", False):
                continue
            if img.upload_status != "uploaded":
                continue
            data = get_bytes(img.object_key) if img.object_key else None
            inference_data = _prepare_inference_image(data)
            image_b64 = base64.b64encode(inference_data).decode("ascii") if inference_data else None
            image_payloads.append(
                {
                    "image_id": str(img.id),
                    "angle_type": img.angle_type,
                    "sha256": img.sha256,
                    "perceptual_hash": img.perceptual_hash,
                    "has_bytes": data is not None,
                    "byte_size": len(data) if data else img.byte_size,
                    "capture_lat": img.capture_lat if img.capture_lat is not None else sub.capture_lat,
                    "capture_lon": img.capture_lon if img.capture_lon is not None else sub.capture_lon,
                    "object_key": img.object_key,
                    "image_bytes": image_b64,
                }
            )

        request_body = {
            "submission_id": str(sub.id),
            "expected_crop": crop_code,
            "metadata": {
                "capture_lat": sub.capture_lat,
                "capture_lon": sub.capture_lon,
                "capture_accuracy_m": sub.capture_accuracy_m,
                "anomaly_flags": sub.anomaly_flags or {},
            },
            "images": image_payloads,
            "adapter": settings.ai_model_adapter,
        }

        prediction: dict[str, Any]
        try:
            with httpx.Client(timeout=60.0) as client:
                headers = (
                    {"X-Service-Token": settings.ai_service_token}
                    if settings.ai_service_token
                    else None
                )
                resp = client.post(
                    f"{settings.ai_service_url}/v1/analyze",
                    json=request_body,
                    headers=headers,
                )
                resp.raise_for_status()
                prediction = resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.exception("AI service call failed: %s", exc)
            if defer_retryable_failure:
                raise RetryableAIServiceError(type(exc).__name__) from exc
            # Never convert infrastructure failure into invented crop-loss
            # evidence. Route the case to a person and preserve the job error.
            job.status = "failed"
            job.error_message = f"AI service unavailable: {type(exc).__name__}"[:1000]
            job.completed_at = datetime.now(timezone.utc)
            sub.status = "physical_inspection"
            db.add(
                Alert(
                    alert_type="ai_service_unavailable",
                    severity="warning",
                    title="Physical inspection required",
                    message=f"Submission {sub.id} could not be analyzed by the AI service.",
                    submission_id=sub.id,
                )
            )
            notify_user(
                db,
                user_id=sub.submitted_by,
                event_type="physical_inspection_required",
                title="Physical inspection required",
                body="Automated analysis was unavailable; no AI loss estimate was generated.",
                related_submission_id=sub.id,
            )
            db.commit()
            return {"status": sub.status, "job_id": str(job.id), "ai_result": "unavailable"}

        pred_row = AIPrediction(
            ai_job_id=job.id,
            submission_id=sub.id,
            model_version=prediction.get("model_version", "unknown"),
            adapter_type=prediction.get("adapter_type", settings.ai_model_adapter),
            is_production_validated=bool(prediction.get("is_production_validated", False)),
            predicted_crop=prediction.get("predicted_crop"),
            crop_confidence=prediction.get("crop_confidence"),
            predicted_growth_stage=prediction.get("predicted_growth_stage"),
            growth_stage_confidence=prediction.get("growth_stage_confidence"),
            predicted_grade=prediction.get("predicted_grade"),
            grade_label=prediction.get("grade_label"),
            grade_confidence=prediction.get("grade_confidence"),
            grade_scores=prediction.get("grade_scores"),
            damage_scores=prediction.get("damage_categories") or prediction.get("damage_scores"),
            primary_damage=prediction.get("primary_damage"),
            affected_area_pct=_first_not_none(
                prediction.get("estimated_affected_area_pct"),
                prediction.get("affected_area_pct"),
            ),
            severity=prediction.get("severity"),
            overall_confidence=prediction.get("overall_confidence"),
            quality_warnings=prediction.get("quality_warnings"),
            anomaly_flags=prediction.get("anomaly_flags"),
            human_review_recommendation=prediction.get("human_review_recommendation"),
            explanation=prediction.get("explanation"),
            raw_response=prediction,
            processing_duration_ms=prediction.get("processing_duration_ms"),
        )
        db.add(pred_row)

        location_anomaly = bool((sub.anomaly_flags or {}).get("outside_plot_proximity"))
        crop_mismatch = bool(
            crop_code
            and prediction.get("predicted_crop")
            and prediction.get("predicted_crop") != crop_code
            and (prediction.get("crop_confidence") or 0) > 0.6
        )
        quality_weak = bool(prediction.get("image_validation", {}).get("passed") is False)

        status, rec = decide_review_path(
            prediction,
            location_anomaly=location_anomaly,
            crop_mismatch=crop_mismatch,
            quality_weak=quality_weak,
        )
        pred_row.human_review_recommendation = rec
        sub.status = status
        sub.severity = prediction.get("severity")

        db.add(
            DamageAssessment(
                submission_id=sub.id,
                source="ai",
                primary_damage_code=prediction.get("primary_damage"),
                damage_codes=list((prediction.get("damage_categories") or {}).keys())
                if isinstance(prediction.get("damage_categories"), dict)
                else prediction.get("damage_codes"),
                severity=prediction.get("severity"),
                affected_area_pct=prediction.get("estimated_affected_area_pct"),
                confidence=prediction.get("overall_confidence"),
                notes="AI preliminary assessment — not production validated"
                if not prediction.get("is_production_validated")
                else None,
                is_final=False,
            )
        )

        if status in ("physical_inspection",) or (sub.severity or "").lower() in ("high", "severe", "critical"):
            high_severity = (sub.severity or "").lower() in ("high", "severe", "critical")
            db.add(
                Alert(
                    alert_type="high_severity_damage" if high_severity else "physical_inspection_required",
                    severity="high" if high_severity else "warning",
                    title="High-severity crop damage detected" if high_severity else "Physical inspection required",
                    message=f"Submission {sub.id} requires attention ({sub.severity or 'inconclusive'})",
                    submission_id=sub.id,
                )
            )

        notify_user(
            db,
            user_id=sub.submitted_by,
            event_type="processing_completed",
            title="Analysis complete",
            body=f"Your crop evidence is ready for review. Status: {sub.status}",
            title_hi="विश्लेषण पूर्ण",
            body_hi=f"आपका फसल प्रमाण समीक्षा के लिए तैयार है। स्थिति: {sub.status}",
            related_submission_id=sub.id,
        )
        # Also notify farm-owning farmer when FO submitted on their cycle
        try:
            from app.db.models import Farm, FarmerProfile, Plot

            owner = (
                db.query(FarmerProfile.user_id)
                .join(Farm, Farm.farmer_id == FarmerProfile.id)
                .join(Plot, Plot.farm_id == Farm.id)
                .join(CropCycle, CropCycle.plot_id == Plot.id)
                .filter(CropCycle.id == sub.crop_cycle_id)
                .first()
            )
            if owner and owner.user_id != sub.submitted_by:
                notify_user(
                    db,
                    user_id=owner.user_id,
                    event_type="processing_completed",
                    title="Analysis complete",
                    body=f"Crop evidence for your farm is ready. Status: {sub.status}",
                    title_hi="विश्लेषण पूर्ण",
                    body_hi=f"आपके खेत का फसल प्रमाण तैयार है। स्थिति: {sub.status}",
                    related_submission_id=sub.id,
                )
        except Exception:  # noqa: BLE001
            logger.exception("owner_notify_failed")

        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        return {"status": sub.status, "job_id": str(job.id)}
    except Exception as exc:  # noqa: BLE001
        if isinstance(exc, RetryableAIServiceError):
            db.rollback()
            raise
        logger.exception("AI job failed")
        try:
            job = db.query(AIJob).filter(AIJob.id == job_id).first()
            sub = db.query(Submission).filter(Submission.id == submission_id).first()
            if job:
                job.status = "failed"
                job.error_message = str(exc)
                job.completed_at = datetime.now(timezone.utc)
            if sub:
                sub.status = "failed"
            db.commit()
        except Exception:
            db.rollback()
        return {"error": type(exc).__name__}
    finally:
        db.close()


def _first_not_none(*values: Any) -> Any:
    return next((value for value in values if value is not None), None)


def _prepare_inference_image(data: bytes | None) -> bytes | None:
    """Create a bounded inference copy while leaving original evidence intact."""
    if not data:
        return None
    try:
        with Image.open(io.BytesIO(data)) as image:
            image = image.convert("RGB")
            image.thumbnail((1600, 1600))
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=85, optimize=True)
            return output.getvalue()
    except Exception:  # noqa: BLE001
        logger.warning("uploaded image could not be decoded for inference")
        return None


@celery_app.task(name="process_submission_ai", bind=True, max_retries=3)
def process_submission_ai(self, submission_id: str, job_id: str) -> dict[str, Any]:
    """Normal evaluation queue (celery_queue_default / evaluation)."""
    return _run_with_retry(self, submission_id, job_id)


@celery_app.task(name="process_recapture_ai", bind=True, max_retries=3)
def process_recapture_ai(self, submission_id: str, job_id: str) -> dict[str, Any]:
    """High-priority recapture queue (celery_queue_recapture)."""
    return _run_with_retry(self, submission_id, job_id)


def _run_with_retry(task, submission_id: str, job_id: str) -> dict[str, Any]:
    try:
        return process_submission_ai_sync(
            submission_id,
            job_id,
            defer_retryable_failure=True,
        )
    except RetryableAIServiceError as exc:
        final = task.request.retries >= task.max_retries
        result = _record_ai_service_failure(submission_id, job_id, exc, final=final)
        if final:
            return result
        countdown = min(60, 5 * (2 ** task.request.retries))
        raise task.retry(exc=exc, countdown=countdown)


def _record_ai_service_failure(
    submission_id: str,
    job_id: str,
    exc: Exception,
    *,
    final: bool,
) -> dict[str, Any]:
    """Persist retry state or the final safe human-inspection fallback."""
    with SessionLocal() as db:
        job = db.query(AIJob).filter(AIJob.id == job_id).with_for_update().first()
        sub = db.query(Submission).filter(Submission.id == submission_id).first()
        if not job or not sub:
            return {"error": "not_found"}
        job.attempt += 1
        job.error_message = f"AI service unavailable: {type(exc).__name__}"[:1000]
        if not final:
            job.status = "retrying"
            sub.status = "processing"
            db.commit()
            return {"status": "retrying", "job_id": str(job.id)}
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc)
        sub.status = "physical_inspection"
        db.add(
            Alert(
                alert_type="ai_service_unavailable",
                severity="warning",
                title="Physical inspection required",
                message=f"Submission {sub.id} exhausted automated-analysis retries.",
                submission_id=sub.id,
            )
        )
        notify_user(
            db,
            user_id=sub.submitted_by,
            event_type="physical_inspection_required",
            title="Physical inspection required",
            body="Automated analysis remained unavailable; no AI loss estimate was generated.",
            related_submission_id=sub.id,
        )
        db.commit()
        return {"status": sub.status, "job_id": str(job.id), "ai_result": "unavailable"}


def enqueue_ai_job(submission_id: str, job_id: str, *, high_priority: bool = False):
    """Route to evaluation vs recapture queue (xyz.md §3)."""
    if high_priority:
        return process_recapture_ai.delay(submission_id, job_id)
    return process_submission_ai.delay(submission_id, job_id)
