"""Clear locally captured domain data while preserving accounts and catalogs."""

from __future__ import annotations

import argparse
import logging

from app.core.config import get_settings
from app.db.models import (
    AIJob,
    AIPrediction,
    Alert,
    AuditLog,
    CropCycle,
    DamageAssessment,
    DeviceRecord,
    EvidenceReminderPlan,
    Farm,
    FarmerProfile,
    FieldOfficerProfile,
    HumanReview,
    ImageMetadata,
    Jurisdiction,
    Notification,
    Plot,
    RecaptureRequest,
    RefreshToken,
    Submission,
    SubmissionImage,
    SyncOperation,
    SystemSetting,
    User,
    UserRole,
)
from app.db.session import SessionLocal
from app.services.storage import _client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clear-operational-data")

DEMO_EMAILS = (
    "admin@fasalpramaan.local",
    "reviewer@fasalpramaan.local",
    "officer@fasalpramaan.local",
    "farmer@fasalpramaan.local",
)


def clear_database() -> dict[str, int]:
    db = SessionLocal()
    counts: dict[str, int] = {}
    deletion_order = [
        AuditLog,
        Notification,
        Alert,
        HumanReview,
        DamageAssessment,
        RecaptureRequest,
        AIPrediction,
        AIJob,
        ImageMetadata,
        SubmissionImage,
        EvidenceReminderPlan,
        SyncOperation,
        Submission,
        CropCycle,
        Plot,
        Farm,
        RefreshToken,
        DeviceRecord,
    ]
    try:
        for model in deletion_order:
            counts[model.__tablename__] = db.query(model).delete(
                synchronize_session=False
            )

        demo_user_ids = [
            value
            for (value,) in db.query(User.id).filter(User.email.in_(DEMO_EMAILS)).all()
        ]
        if not demo_user_ids:
            raise RuntimeError("demo accounts are missing; refusing to clear account data")

        db.query(SystemSetting).filter(
            SystemSetting.updated_by.is_not(None),
            SystemSetting.updated_by.notin_(demo_user_ids),
        ).update({SystemSetting.updated_by: None}, synchronize_session=False)

        counts[UserRole.__tablename__] = db.query(UserRole).delete(
            synchronize_session=False
        )
        counts["non_demo_farmer_profiles"] = (
            db.query(FarmerProfile)
            .filter(FarmerProfile.user_id.notin_(demo_user_ids))
            .delete(synchronize_session=False)
        )
        counts["non_demo_field_officer_profiles"] = (
            db.query(FieldOfficerProfile)
            .filter(FieldOfficerProfile.user_id.notin_(demo_user_ids))
            .delete(synchronize_session=False)
        )
        counts["non_demo_users"] = (
            db.query(User)
            .filter(User.id.notin_(demo_user_ids))
            .delete(synchronize_session=False)
        )
        db.query(FarmerProfile).update(
            {
                FarmerProfile.village_id: None,
                FarmerProfile.aadhaar_last4: None,
                FarmerProfile.address_line: None,
            },
            synchronize_session=False,
        )
        db.query(FieldOfficerProfile).update(
            {FieldOfficerProfile.jurisdiction_id: None}, synchronize_session=False
        )
        db.query(Jurisdiction).update(
            {Jurisdiction.parent_id: None}, synchronize_session=False
        )
        counts[Jurisdiction.__tablename__] = db.query(Jurisdiction).delete(
            synchronize_session=False
        )
        db.commit()
        return counts
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def clear_evidence_bucket() -> int:
    settings = get_settings()
    client = _client(public=False)
    removed = 0

    paginator = client.get_paginator("list_object_versions")
    for page in paginator.paginate(Bucket=settings.minio_bucket):
        objects = [
            {"Key": item["Key"], "VersionId": item["VersionId"]}
            for item in [*(page.get("Versions") or []), *(page.get("DeleteMarkers") or [])]
        ]
        for offset in range(0, len(objects), 1000):
            batch = objects[offset : offset + 1000]
            if batch:
                client.delete_objects(
                    Bucket=settings.minio_bucket,
                    Delete={"Objects": batch, "Quiet": True},
                )
                removed += len(batch)
    return removed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--confirm-local-reset",
        action="store_true",
        help="required acknowledgement that local operational records will be removed",
    )
    args = parser.parse_args()
    if not args.confirm_local_reset:
        parser.error("pass --confirm-local-reset to clear local operational data")

    counts = clear_database()
    objects = clear_evidence_bucket()
    for table, count in counts.items():
        logger.info("removed %d row(s) from %s", count, table)
    logger.info("removed %d object version(s) from local evidence storage", objects)
    logger.info("demo accounts and reference catalogs were preserved")


if __name__ == "__main__":
    main()
