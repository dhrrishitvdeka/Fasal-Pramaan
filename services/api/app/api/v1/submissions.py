"""Submission lifecycle endpoints."""

from __future__ import annotations

import io
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from PIL import Image
from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from app.core.config import get_settings
from app.core.deps import (
    ROLE_ADMIN,
    ROLE_FIELD_OFFICER,
    ROLE_REVIEWER,
    CurrentUser,
    DbSession,
    user_role_codes,
)
from app.db.models import (
    AIJob,
    AIPrediction,
    CropCycle,
    Farm,
    FarmerProfile,
    GrowthStage,
    ImageMetadata,
    Plot,
    RecaptureRequest,
    Submission,
    SubmissionImage,
)
from app.schemas.common import MessageOut, Paginated
from app.schemas.submission import (
    AIPredictionOut,
    FinalizeSubmissionRequest,
    ImageUploadedConfirm,
    SubmissionDraftCreate,
    SubmissionImageOut,
    SubmissionOut,
    UploadURLRequest,
    UploadURLItem,
    UploadURLResponse,
)
from app.services.audit import write_audit
from app.services.geo import point_distance_to_plot, point_wkt
from app.services.notifications import notify_user
from app.services.storage import (
    StorageUnavailableError,
    build_object_key,
    ensure_bucket,
    object_metadata,
    presigned_get_url,
    presigned_put_url,
    verify_object,
)
from app.api.v1.farms import _check_cycle_access, _farmer_profile

router = APIRouter(prefix="/submissions", tags=["Submissions"])

_PIL_FORMAT_BY_CONTENT_TYPE = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}


def _open_recapture(db: DbSession, submission_id) -> RecaptureRequest | None:
    return (
        db.query(RecaptureRequest)
        .filter(
            RecaptureRequest.submission_id == submission_id,
            RecaptureRequest.status == "open",
        )
        .order_by(RecaptureRequest.created_at.desc())
        .first()
    )


def _uploaded_required_angles(
    db: DbSession,
    submission_id,
    recapture: RecaptureRequest | None = None,
) -> set[str]:
    query = db.query(SubmissionImage.angle_type).filter(
        SubmissionImage.submission_id == submission_id,
        SubmissionImage.upload_status == "uploaded",
        SubmissionImage.is_deleted.is_(False),
    )
    if recapture is not None:
        query = query.filter(SubmissionImage.created_at >= recapture.created_at)
    return {row[0] for row in query.all()}


def _validate_image_bytes(data: bytes, expected_content_type: str) -> tuple[list[str], dict]:
    issues: list[str] = []
    checks: dict = {"decoded": False}
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            checks = {
                "decoded": True,
                "format": image.format,
                "width": image.width,
                "height": image.height,
            }
            if image.format != _PIL_FORMAT_BY_CONTENT_TYPE.get(expected_content_type):
                issues.append("decoded_format_mismatch")
            if image.width < 64 or image.height < 64:
                issues.append("resolution_too_low")
            if image.width * image.height > 100_000_000:
                issues.append("pixel_count_too_large")
    except Exception:  # noqa: BLE001
        issues.append("invalid_or_undecodable_image")
    checks["issues"] = list(dict.fromkeys(issues))
    return checks["issues"], checks


def _serialize_submission(db: DbSession, sub: Submission, include_urls: bool = True) -> SubmissionOut:
    images = []
    for img in sorted(sub.images, key=lambda i: i.sequence_order):
        if getattr(img, "is_deleted", False):
            continue
        url = None
        if include_urls and img.object_key and img.upload_status == "uploaded":
            try:
                url = presigned_get_url(img.object_key)
            except Exception:
                url = None
        images.append(
            SubmissionImageOut(
                id=img.id,
                angle_type=img.angle_type,
                sequence_order=img.sequence_order,
                upload_status=img.upload_status,
                sha256=img.sha256,
                object_key=img.object_key,
                download_url=url,
                quality_flags=img.quality_flags,
            )
        )
    pred = (
        db.query(AIPrediction)
        .filter(AIPrediction.submission_id == sub.id)
        .order_by(AIPrediction.created_at.desc())
        .first()
    )
    latest = AIPredictionOut.model_validate(pred) if pred else None
    return SubmissionOut(
        id=sub.id,
        crop_cycle_id=sub.crop_cycle_id,
        submitted_by=sub.submitted_by,
        status=sub.status,
        growth_stage_id=sub.growth_stage_id,
        on_behalf_of_farmer_id=sub.on_behalf_of_farmer_id,
        capture_lat=sub.capture_lat,
        capture_lon=sub.capture_lon,
        capture_accuracy_m=sub.capture_accuracy_m,
        capture_timestamp=sub.capture_timestamp,
        farmer_observations=sub.farmer_observations,
        severity=sub.severity,
        final_severity=sub.final_severity,
        final_assessment_notes=sub.final_assessment_notes,
        offline_created=sub.offline_created,
        idempotency_key=sub.idempotency_key,
        finalized_at=sub.finalized_at,
        anomaly_flags=sub.anomaly_flags,
        images=images,
        latest_prediction=latest,
    )


def _cycle_farm_owner_id(db: DbSession, cycle: CropCycle):
    """FarmerProfile.id of the farm that owns this crop cycle (or None)."""
    row = (
        db.query(Farm.farmer_id)
        .join(Plot, Plot.farm_id == Farm.id)
        .filter(Plot.id == cycle.plot_id, Farm.is_deleted.is_(False), Plot.is_deleted.is_(False))
        .first()
    )
    return row.farmer_id if row else None


def _user_owns_submission_farm(db: DbSession, user: CurrentUser, sub: Submission) -> bool:
    """True if user owns the farm behind the submission's crop cycle.

    Primary ownership is always farm→cycle geometry — never trust
    ``on_behalf_of_farmer_id`` alone (that field can be stale/mis-set).
    """
    profile = _farmer_profile(db, user)
    if not profile:
        return False
    row = (
        db.query(Farm.farmer_id)
        .join(Plot, Plot.farm_id == Farm.id)
        .join(CropCycle, CropCycle.plot_id == Plot.id)
        .filter(CropCycle.id == sub.crop_cycle_id, Farm.is_deleted.is_(False))
        .first()
    )
    return bool(row and row.farmer_id == profile.id)


def _check_submission_access(db: DbSession, user: CurrentUser, submission_id: str) -> Submission:
    """Submitter, farm owner (via cycle), or staff — default deny."""
    sub = (
        db.query(Submission)
        .options(joinedload(Submission.images))
        .filter(Submission.id == submission_id, Submission.is_deleted.is_(False))
        .first()
    )
    if not sub:
        raise HTTPException(404, "Submission not found")
    roles = set(user_role_codes(user))
    if sub.submitted_by == user.id or roles.intersection({ROLE_ADMIN, ROLE_REVIEWER}):
        return sub
    if ROLE_FIELD_OFFICER in roles:
        _check_cycle_access(db, user, str(sub.crop_cycle_id))
        return sub
    if _user_owns_submission_farm(db, user, sub):
        return sub
    raise HTTPException(403, "Not allowed")


def _farmer_visible_filter(db: DbSession, user: CurrentUser):
    """SQL filter: own submissions + any submission on my farms (not on_behalf alone)."""
    profile = _farmer_profile(db, user)
    if not profile:
        return Submission.submitted_by == user.id
    my_cycle_ids = (
        db.query(CropCycle.id)
        .join(Plot, Plot.id == CropCycle.plot_id)
        .join(Farm, Farm.id == Plot.farm_id)
        .filter(Farm.farmer_id == profile.id, CropCycle.is_deleted.is_(False))
    )
    return or_(
        Submission.submitted_by == user.id,
        Submission.crop_cycle_id.in_(my_cycle_ids),
    )


@router.post("/drafts", response_model=SubmissionOut, status_code=201)
def create_draft(body: SubmissionDraftCreate, db: DbSession, user: CurrentUser, request: Request) -> SubmissionOut:
    existing = db.query(Submission).filter(Submission.idempotency_key == body.idempotency_key).first()
    if existing:
        # Prevent IDOR via guessed/shared idempotency keys across accounts
        if existing.submitted_by != user.id and ROLE_ADMIN not in user_role_codes(user):
            raise HTTPException(409, "Idempotency key already used by another account")
        existing = (
            db.query(Submission)
            .options(joinedload(Submission.images))
            .filter(Submission.id == existing.id)
            .one()
        )
        return _serialize_submission(db, existing)

    cycle = _check_cycle_access(db, user, str(body.crop_cycle_id))

    # FO on-behalf must be the farmer who owns the cycle's farm (prevents
    # granting unrelated farmer C visibility into farmer A's evidence).
    on_behalf = body.on_behalf_of_farmer_id
    if on_behalf is not None:
        roles = set(user_role_codes(user))
        if not roles.intersection({ROLE_ADMIN, ROLE_FIELD_OFFICER}):
            raise HTTPException(403, "Only field officers may submit on behalf of a farmer")
        if not db.query(FarmerProfile).filter(FarmerProfile.id == on_behalf).first():
            raise HTTPException(400, "on_behalf_of_farmer_id not found")
        farm_owner_id = _cycle_farm_owner_id(db, cycle)
        if farm_owner_id is None or farm_owner_id != on_behalf:
            raise HTTPException(
                400,
                "on_behalf_of_farmer_id must own the farm linked to this crop cycle",
            )

    # PDF: growth stage at capture — default from active cycle when client omits
    growth_stage_id = body.growth_stage_id or cycle.current_growth_stage_id
    if growth_stage_id:
        stage = db.query(GrowthStage).filter(
            GrowthStage.id == growth_stage_id,
            GrowthStage.is_deleted.is_(False),
        ).first()
        if not stage or stage.crop_type_id not in (None, cycle.crop_type_id):
            raise HTTPException(400, "Growth stage does not belong to the crop cycle")

    settings = get_settings()
    anomaly: dict = {}
    if body.capture_accuracy_m is not None and body.capture_accuracy_m > settings.gps_accuracy_limit_meters:
        anomaly["weak_gps"] = True
    if body.capture_lat is not None and body.capture_lon is not None:
        dist = point_distance_to_plot(db, cycle.plot_id, body.capture_lon, body.capture_lat)
        if dist is not None and dist > settings.plot_proximity_meters:
            anomaly["outside_plot_proximity"] = True
            anomaly["distance_m"] = dist
    else:
        anomaly["missing_gps"] = True

    sub = Submission(
        crop_cycle_id=body.crop_cycle_id,
        submitted_by=user.id,
        on_behalf_of_farmer_id=on_behalf,
        growth_stage_id=growth_stage_id,
        status="draft",
        capture_lat=body.capture_lat,
        capture_lon=body.capture_lon,
        capture_accuracy_m=body.capture_accuracy_m,
        capture_timestamp=body.capture_timestamp or datetime.now(timezone.utc),
        farmer_observations=body.farmer_observations,
        idempotency_key=body.idempotency_key,
        device_id=body.device_id,
        offline_created=body.offline_created,
        metadata_json=body.metadata_json,
        anomaly_flags=anomaly or None,
    )
    if body.capture_lat is not None and body.capture_lon is not None:
        sub.capture_location = point_wkt(body.capture_lon, body.capture_lat)
    db.add(sub)
    db.flush()
    write_audit(
        db,
        action="create_draft",
        entity_type="submission",
        entity_id=str(sub.id),
        actor_id=user.id,
        after={"idempotency_key": body.idempotency_key},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(sub)
    sub = db.query(Submission).options(joinedload(Submission.images)).filter(Submission.id == sub.id).one()
    return _serialize_submission(db, sub)


@router.post("/{submission_id}/upload-urls", response_model=UploadURLResponse)
def request_upload_urls(
    submission_id: str, body: UploadURLRequest, db: DbSession, user: CurrentUser
) -> UploadURLResponse:
    sub = _check_submission_access(db, user, submission_id)
    roles = set(user_role_codes(user))
    # Reviewers may not request uploads for farmer drafts
    if sub.submitted_by != user.id and not roles.intersection({ROLE_ADMIN, ROLE_FIELD_OFFICER}):
        raise HTTPException(403, "Not allowed")
    if sub.status not in ("draft", "uploading", "queued", "failed", "needs_recapture"):
        raise HTTPException(409, f"Cannot upload for status {sub.status}")

    settings = get_settings()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    try:
        ensure_bucket()
    except StorageUnavailableError as exc:
        raise HTTPException(503, "Evidence storage is unavailable; retry later") from exc
    uploads: list[UploadURLItem] = []
    recapture = _open_recapture(db, sub.id)
    if sub.status == "needs_recapture" and recapture is None:
        raise HTTPException(409, "Recapture state is missing its open request")

    for meta in body.images:
        if meta.byte_size > max_bytes:
            raise HTTPException(400, f"Image exceeds {settings.max_upload_size_mb}MB limit")
        # Duplicate checksum check
        dup = (
            db.query(SubmissionImage)
            .join(Submission, Submission.id == SubmissionImage.submission_id)
            .filter(
                SubmissionImage.sha256 == meta.sha256,
                SubmissionImage.is_deleted.is_(False),
                Submission.is_deleted.is_(False),
                Submission.submitted_by == sub.submitted_by,
            )
            .first()
        )
        if dup and (str(dup.submission_id) != str(sub.id) or dup.angle_type != meta.angle_type):
            raise HTTPException(409, "Duplicate image checksum detected")
        if meta.perceptual_hash:
            visual_dup = (
                db.query(SubmissionImage)
                .filter(
                    SubmissionImage.perceptual_hash == meta.perceptual_hash,
                    SubmissionImage.is_deleted.is_(False),
                    SubmissionImage.submission_id == sub.id,
                    SubmissionImage.angle_type != meta.angle_type,
                )
                .first()
            )
            if visual_dup:
                raise HTTPException(409, "Visually duplicate image detected across required angles")

        if dup and str(dup.submission_id) == str(sub.id) and dup.angle_type == meta.angle_type:
            if recapture is not None and dup.created_at < recapture.created_at:
                raise HTTPException(409, "Recapture requires newly captured evidence")
            if dup.byte_size != meta.byte_size or dup.content_type != meta.content_type:
                raise HTTPException(409, "Upload metadata conflicts with the existing image")
            already_uploaded = dup.upload_status == "uploaded"
            verify_existing = False
            if dup.upload_status == "failed":
                extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[
                    meta.content_type
                ]
                dup.object_key = build_object_key(str(sub.id), meta.angle_type, extension)
                dup.upload_status = "pending"
            elif not already_uploaded:
                try:
                    verify_existing = object_metadata(dup.object_key) is not None
                except StorageUnavailableError as exc:
                    raise HTTPException(503, "Evidence storage is unavailable; retry later") from exc
                dup.upload_status = "pending"
            method = (
                "ALREADY_UPLOADED"
                if already_uploaded
                else "VERIFY_EXISTING"
                if verify_existing
                else "PUT"
            )
            url = (
                presigned_put_url(
                    dup.object_key,
                    dup.content_type or meta.content_type,
                    dup.byte_size,
                )
                if method == "PUT"
                else None
            )
            uploads.append(
                UploadURLItem(
                    image_id=dup.id,
                    angle_type=dup.angle_type,
                    object_key=dup.object_key,
                    upload_url=url,
                    method=method,
                    headers=(
                        {
                            "Content-Type": dup.content_type or meta.content_type,
                            "Content-Length": str(dup.byte_size),
                            "If-None-Match": "*",
                        }
                        if method == "PUT"
                        else {}
                    ),
                )
            )
            continue

        extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[meta.content_type]
        object_key = build_object_key(str(sub.id), meta.angle_type, extension)
        img = SubmissionImage(
            submission_id=sub.id,
            angle_type=meta.angle_type,
            sequence_order=meta.sequence_order,
            object_key=object_key,
            content_type=meta.content_type,
            byte_size=meta.byte_size,
            sha256=meta.sha256,
            perceptual_hash=meta.perceptual_hash,
            upload_status="pending",
            capture_lat=meta.capture_lat if meta.capture_lat is not None else sub.capture_lat,
            capture_lon=meta.capture_lon if meta.capture_lon is not None else sub.capture_lon,
            capture_accuracy_m=meta.capture_accuracy_m if meta.capture_accuracy_m is not None else sub.capture_accuracy_m,
            captured_at=meta.captured_at or sub.capture_timestamp,
            quality_flags=meta.quality_flags,
        )
        db.add(img)
        db.flush()
        db.add(
            ImageMetadata(
                image_id=img.id,
                width=meta.width,
                height=meta.height,
                orientation=meta.orientation,
                device_model=meta.device_model,
                client_checks=meta.client_checks,
            )
        )
        url = presigned_put_url(object_key, meta.content_type, meta.byte_size)
        uploads.append(
            UploadURLItem(
                image_id=img.id,
                angle_type=meta.angle_type,
                object_key=object_key,
                upload_url=url,
                headers={
                    "Content-Type": meta.content_type,
                    "Content-Length": str(meta.byte_size),
                    "If-None-Match": "*",
                },
            )
        )

    db.flush()
    required = set(recapture.required_angles or []) if recapture else {
        "wide_field",
        "mid_canopy",
        "closeup_damage",
    }
    uploaded = _uploaded_required_angles(db, sub.id, recapture)
    sub.status = "uploaded" if required and required.issubset(uploaded) else "uploading"
    db.commit()
    return UploadURLResponse(submission_id=sub.id, uploads=uploads)


@router.post("/{submission_id}/images/confirm", response_model=MessageOut)
def confirm_uploads(submission_id: str, body: list[ImageUploadedConfirm], db: DbSession, user: CurrentUser) -> MessageOut:
    sub = _check_submission_access(db, user, submission_id)
    roles = set(user_role_codes(user))
    if sub.submitted_by != user.id and not roles.intersection({ROLE_ADMIN, ROLE_FIELD_OFFICER}):
        raise HTTPException(403, "Not allowed")
    if not body:
        raise HTTPException(400, "At least one image confirmation is required")
    failed: dict[str, list[str]] = {}
    for item in body:
        img = db.query(SubmissionImage).filter(
            SubmissionImage.id == item.image_id, SubmissionImage.submission_id == sub.id
        ).first()
        if not img:
            raise HTTPException(404, f"Image {item.image_id} not found")
        if not img.object_key or img.byte_size is None or not img.content_type or not img.sha256:
            img.upload_status = "failed"
            failed[str(item.image_id)] = ["incomplete_expected_metadata"]
            continue
        try:
            valid, issues, data = verify_object(
                img.object_key,
                expected_size=img.byte_size,
                expected_content_type=img.content_type,
                expected_sha256=img.sha256,
            )
        except StorageUnavailableError as exc:
            raise HTTPException(503, "Evidence storage is unavailable; retry confirmation") from exc
        if data is not None:
            decode_issues, decoded = _validate_image_bytes(data, img.content_type)
            issues.extend(decode_issues)
            valid = valid and not decode_issues
            if img.image_metadata:
                img.image_metadata.server_checks = decoded
        if not valid:
            img.upload_status = "failed"
            failed[str(item.image_id)] = issues
            continue
        img.upload_status = "uploaded"
    db.commit()
    if failed:
        raise HTTPException(
            400,
            detail={
                "message": "One or more uploaded objects failed server verification",
                "failed_images": failed,
            },
        )
    recapture = _open_recapture(db, sub.id)
    required = set(recapture.required_angles or []) if recapture else {
        "wide_field",
        "mid_canopy",
        "closeup_damage",
    }
    uploaded = _uploaded_required_angles(db, sub.id, recapture)
    if required.issubset(uploaded):
        sub.status = "uploaded"
        db.commit()
    return MessageOut(message="Upload status updated")


@router.post("/{submission_id}/finalize", response_model=SubmissionOut)
def finalize_submission(
    submission_id: str,
    body: FinalizeSubmissionRequest,
    db: DbSession,
    user: CurrentUser,
) -> SubmissionOut:
    sub = _check_submission_access(db, user, submission_id)
    roles = set(user_role_codes(user))
    if sub.submitted_by != user.id and not roles.intersection({ROLE_ADMIN, ROLE_FIELD_OFFICER}):
        raise HTTPException(403, "Not allowed")

    # Serialize finalization so retries/double-clicks cannot create duplicate jobs.
    db.query(Submission.id).filter(Submission.id == sub.id).with_for_update().one()
    recapture = _open_recapture(db, sub.id)
    retrying_finalized = False
    if sub.finalized_at is not None and recapture is None:
        latest_job = (
            db.query(AIJob)
            .filter(AIJob.submission_id == sub.id)
            .order_by(AIJob.created_at.desc())
            .first()
        )
        if latest_job is not None and latest_job.status != "failed":
            return _serialize_submission(db, sub)
        retrying_finalized = True
    if sub.status != "uploaded":
        raise HTTPException(409, f"Submission must be uploaded before finalize (current: {sub.status})")

    required = set(recapture.required_angles or []) if recapture else {
        "wide_field",
        "mid_canopy",
        "closeup_damage",
    }
    image_query = db.query(SubmissionImage).filter(
        SubmissionImage.submission_id == sub.id,
        SubmissionImage.upload_status == "uploaded",
        SubmissionImage.is_deleted.is_(False),
    )
    if recapture is not None:
        image_query = image_query.filter(SubmissionImage.created_at >= recapture.created_at)
    scoped_images = image_query.all()
    angles = {image.angle_type for image in scoped_images}
    missing = required - angles
    if missing:
        raise HTTPException(400, f"Missing required angles: {', '.join(sorted(missing))}")

    evidence_missing = [
        i.angle_type
        for i in scoped_images
        if i.angle_type in required
        and i.upload_status == "uploaded"
        and (i.capture_lat is None or i.capture_lon is None or i.captured_at is None)
    ]
    if evidence_missing:
        raise HTTPException(400, f"Per-image geotag and capture time required: {', '.join(sorted(set(evidence_missing)))}")

    # PDF requires geo-tagged evidence — refuse finalize without coordinates
    if sub.capture_lat is None or sub.capture_lon is None:
        raise HTTPException(
            400,
            "Geo-tagged capture required: capture_lat and capture_lon must be set before finalize",
        )

    if body.farmer_observations:
        sub.farmer_observations = body.farmer_observations
    sub.status = "uploaded"
    if not retrying_finalized:
        sub.finalized_at = datetime.now(timezone.utc)

    job = AIJob(submission_id=sub.id, status="queued")
    db.add(job)
    notify_user(
        db,
        user_id=sub.submitted_by,
        event_type=(
            "recapture_uploaded"
            if recapture
            else "submission_requeued"
            if retrying_finalized
            else "submission_uploaded"
        ),
        title=(
            "Recapture uploaded"
            if recapture
            else "Analysis requeued"
            if retrying_finalized
            else "Submission uploaded"
        ),
        body=(
            "Your replacement crop photos were received and will be analysed."
            if recapture
            else "Your stored crop evidence was safely requeued for analysis."
            if retrying_finalized
            else "Your crop photos were received and will be analysed."
        ),
        title_hi="प्रस्तुति अपलोड हुई",
        body_hi="आपकी फसल की तस्वीरें प्राप्त हो गई हैं और विश्लेषण किया जाएगा।",
        related_submission_id=sub.id,
    )
    write_audit(
        db,
        action=("finalize_recapture" if recapture else "requeue_finalized" if retrying_finalized else "finalize"),
        entity_type="submission",
        entity_id=str(sub.id),
        actor_id=user.id,
    )
    db.commit()
    db.refresh(job)

    # Enqueue Celery task (lazy import to avoid circular)
    try:
        from app.workers.tasks import enqueue_ai_job

        async_result = enqueue_ai_job(
            str(sub.id),
            str(job.id),
            high_priority=recapture is not None,
        )
        job.celery_task_id = async_result.id
        if recapture is not None:
            recapture.status = "resolved"
            recapture.resolved_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        job.status = "failed"
        job.error_message = f"Queue unavailable: {type(exc).__name__}"[:1000]
        sub.status = "failed"
        db.commit()
        raise HTTPException(
            503,
            "Submission is safely finalized but the analysis queue is unavailable; retry processing later",
        ) from exc

    sub = db.query(Submission).options(joinedload(Submission.images)).filter(Submission.id == sub.id).one()
    return _serialize_submission(db, sub)


@router.get("", response_model=Paginated[SubmissionOut])
def list_submissions(
    db: DbSession,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
) -> Paginated[SubmissionOut]:
    q = db.query(Submission).filter(Submission.is_deleted.is_(False))
    roles = set(user_role_codes(user))
    if ROLE_FIELD_OFFICER in roles and ROLE_ADMIN not in roles:
        from app.core.deps import field_officer_farm_filter

        q = (
            q.join(CropCycle, CropCycle.id == Submission.crop_cycle_id)
            .join(Plot, Plot.id == CropCycle.plot_id)
            .join(Farm, Farm.id == Plot.farm_id)
            .filter(field_officer_farm_filter(db, user))
        )
    elif not roles.intersection({ROLE_ADMIN, ROLE_REVIEWER}):
        # Farmer sees own submissions and FO captures on their farms
        q = q.filter(_farmer_visible_filter(db, user))
    if status_filter:
        q = q.filter(Submission.status == status_filter)
    total = q.count()
    rows = (
        q.options(joinedload(Submission.images))
        .order_by(Submission.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [_serialize_submission(db, s) for s in rows]
    pages = (total + page_size - 1) // page_size if total else 0
    return Paginated(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.get("/{submission_id}", response_model=SubmissionOut)
def get_submission(submission_id: str, db: DbSession, user: CurrentUser) -> SubmissionOut:
    sub = _check_submission_access(db, user, submission_id)
    return _serialize_submission(db, sub)


@router.post("/{submission_id}/retry-processing", response_model=SubmissionOut)
def retry_processing(submission_id: str, db: DbSession, user: CurrentUser) -> SubmissionOut:
    sub = _check_submission_access(db, user, submission_id)
    roles = set(user_role_codes(user))
    if sub.submitted_by != user.id and not roles.intersection({ROLE_ADMIN, ROLE_FIELD_OFFICER}):
        raise HTTPException(403, "Not allowed")
    if sub.status not in ("failed", "physical_inspection"):
        raise HTTPException(400, "Retry not allowed for this status")
    active_job = db.query(AIJob).filter(
        AIJob.submission_id == sub.id,
        AIJob.status.in_(["queued", "running", "retrying"]),
    ).first()
    if active_job:
        raise HTTPException(409, "An analysis job is already active")
    job = AIJob(submission_id=sub.id, status="queued")
    sub.status = "uploaded"
    db.add(job)
    db.commit()
    db.refresh(job)
    try:
        from app.workers.tasks import enqueue_ai_job

        # Retries / recapture path uses high-priority queue (xyz.md §3)
        async_result = enqueue_ai_job(str(sub.id), str(job.id), high_priority=True)
        job.celery_task_id = async_result.id
        db.commit()
    except Exception as exc:
        job.error_message = f"Queue unavailable: {type(exc).__name__}"[:1000]
        sub.status = "failed"
        db.commit()
        raise HTTPException(503, "Analysis queue is unavailable; retry later") from exc
    sub = db.query(Submission).options(joinedload(Submission.images)).filter(Submission.id == sub.id).one()
    return _serialize_submission(db, sub)


@router.post("/{submission_id}/cancel", response_model=MessageOut)
def cancel_draft(submission_id: str, db: DbSession, user: CurrentUser) -> MessageOut:
    sub = _check_submission_access(db, user, submission_id)
    if sub.submitted_by != user.id:
        raise HTTPException(403, "Not allowed")
    if sub.status not in ("draft", "uploading", "queued"):
        raise HTTPException(400, "Only unprocessed drafts can be cancelled")
    sub.status = "cancelled"
    db.commit()
    return MessageOut(message="Draft cancelled")
