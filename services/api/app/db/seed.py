"""Synthetic seed data for FasalPramaan AI local demos."""

from __future__ import annotations

import hashlib
import logging
import os
import random
import sys
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from PIL import Image, ImageDraw
from sqlalchemy import text

from app.core.security import hash_password
from app.db.models import (
    AIJob,
    AIPrediction,
    Alert,
    CropCycle,
    CropType,
    DamageCategory,
    Farm,
    FarmerProfile,
    FieldOfficerProfile,
    GrowthStage,
    Jurisdiction,
    ModelVersion,
    Notification,
    Plot,
    Role,
    Submission,
    SubmissionImage,
    SystemSetting,
    User,
    UserRole,
)
from app.db.session import SessionLocal
from app.services.geo import point_wkt, polygon_from_ring
from app.services.storage import ensure_bucket, put_bytes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed")

DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "Demo@12345")


def synthetic_demo_jpeg(key: str, angle: str) -> bytes:
    """Create visible, watermarked workflow evidence without external assets."""
    rng = random.Random(int(hashlib.sha256(f"{key}:{angle}".encode()).hexdigest()[:16], 16))
    image = Image.new("RGB", (960, 640), (116, 155, 83))
    draw = ImageDraw.Draw(image)
    for row in range(10):
        y = 130 + row * 55
        color = (45 + row * 2, 105 + row * 3, 42)
        draw.polygon([(0, y), (960, y - 75), (960, y + 20), (0, y + 90)], fill=color)
    for _ in range(170):
        x = rng.randint(0, 959)
        y = rng.randint(120, 639)
        size = rng.randint(7, 18)
        draw.ellipse((x - size, y - size // 2, x + size, y + size // 2), fill=(39, rng.randint(105, 160), 46))
    draw.rectangle((0, 0, 960, 92), fill=(19, 55, 35))
    draw.text((28, 22), "SYNTHETIC DEMO EVIDENCE - NOT A MODEL ACCURACY SAMPLE", fill="white")
    draw.text((28, 58), f"Angle: {angle.replace('_', ' ')}", fill=(208, 236, 209))
    buffer = BytesIO()
    image.save(buffer, "JPEG", quality=88, optimize=True)
    return buffer.getvalue()


def ensure_roles(db) -> dict[str, Role]:
    roles = {}
    for code, name in [
        ("farmer", "Farmer"),
        ("field_officer", "Field Officer"),
        ("reviewer", "Government / Insurance Reviewer"),
        ("administrator", "Administrator"),
    ]:
        role = db.query(Role).filter(Role.code == code).first()
        if not role:
            role = Role(code=code, name=name, description=f"{name} role")
            db.add(role)
            db.flush()
        roles[code] = role
    return roles


def ensure_user(db, email: str, full_name: str, role: Role, phone: str | None = None) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(
        email=email,
        password_hash=hash_password(DEMO_PASSWORD),
        full_name=full_name,
        phone=phone,
        preferred_language="hi" if "farmer" in email else "en",
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    return user


def seed() -> None:
    db = SessionLocal()
    try:
        db.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        db.commit()

        roles = ensure_roles(db)

        admin = ensure_user(db, "admin@fasalpramaan.local", "System Administrator", roles["administrator"])
        ensure_user(db, "reviewer@fasalpramaan.local", "Meera Sharma (Reviewer)", roles["reviewer"], "9000000001")
        officer = ensure_user(db, "officer@fasalpramaan.local", "Ravi Kumar (Field Officer)", roles["field_officer"], "9000000002")
        farmer_user = ensure_user(db, "farmer@fasalpramaan.local", "Suresh Patel (Farmer)", roles["farmer"], "9000000003")
        db.flush()

        # Jurisdictions (synthetic)
        state = db.query(Jurisdiction).filter(Jurisdiction.code == "IN-MP").first()
        if not state:
            state = Jurisdiction(code="IN-MP", name="Madhya Pradesh", name_hi="मध्य प्रदेश", level="state")
            db.add(state)
            db.flush()
        district = db.query(Jurisdiction).filter(Jurisdiction.code == "IN-MP-DEMO").first()
        if not district:
            district = Jurisdiction(
                code="IN-MP-DEMO",
                name="Demo District",
                name_hi="डेमो जिला",
                level="district",
                parent_id=state.id,
                centroid=point_wkt(77.4, 23.25),
            )
            db.add(district)
            db.flush()
        block = db.query(Jurisdiction).filter(Jurisdiction.code == "IN-MP-DEMO-B1").first()
        if not block:
            block = Jurisdiction(
                code="IN-MP-DEMO-B1",
                name="Demo Block",
                name_hi="डेमो ब्लॉक",
                level="block",
                parent_id=district.id,
                centroid=point_wkt(77.41, 23.26),
            )
            db.add(block)
            db.flush()
        village = db.query(Jurisdiction).filter(Jurisdiction.code == "IN-MP-DEMO-V1").first()
        if not village:
            village = Jurisdiction(
                code="IN-MP-DEMO-V1",
                name="Rampur Demo Village",
                name_hi="रामपुर डेमो गाँव",
                level="village",
                parent_id=block.id,
                centroid=point_wkt(77.412, 23.261),
            )
            db.add(village)
            db.flush()

        farmer_profile = db.query(FarmerProfile).filter(FarmerProfile.user_id == farmer_user.id).first()
        if not farmer_profile:
            farmer_profile = FarmerProfile(
                user_id=farmer_user.id,
                farmer_code="F-DEMO0001",
                village_id=village.id,
                aadhaar_last4="1234",
                address_line="Ward 3, Rampur Demo Village",
            )
            db.add(farmer_profile)
            db.flush()

        fo_profile = db.query(FieldOfficerProfile).filter(FieldOfficerProfile.user_id == officer.id).first()
        if not fo_profile:
            fo_profile = FieldOfficerProfile(
                user_id=officer.id,
                employee_code="O-DEMO0001",
                jurisdiction_id=block.id,
                designation="Agriculture Field Officer",
            )
            db.add(fo_profile)
            db.flush()

        # Crops
        crop_defs = [
            ("paddy", "Paddy / Rice", "धान", "kharif"),
            ("wheat", "Wheat", "गेहूँ", "rabi"),
            ("soybean", "Soybean", "सोयाबीन", "kharif"),
            ("cotton", "Cotton", "कपास", "kharif"),
            ("maize", "Maize", "मक्का", "kharif"),
        ]
        crops: dict[str, CropType] = {}
        for code, name, name_hi, season in crop_defs:
            c = db.query(CropType).filter(CropType.code == code).first()
            if not c:
                c = CropType(code=code, name=name, name_hi=name_hi, season=season)
                db.add(c)
                db.flush()
            crops[code] = c

        stages_generic = [
            ("sowing", "Sowing / Germination", "बुवाई", 1),
            ("vegetative", "Vegetative", "वृद्धि", 2),
            ("flowering", "Flowering", "फूलना", 3),
            ("grain_filling", "Grain Filling", "दाना भरना", 4),
            ("maturity", "Maturity", "पकना", 5),
        ]
        for code, name, name_hi, order in stages_generic:
            if not db.query(GrowthStage).filter(GrowthStage.code == code, GrowthStage.crop_type_id.is_(None)).first():
                db.add(
                    GrowthStage(
                        code=code,
                        name=name,
                        name_hi=name_hi,
                        sequence_order=order,
                        crop_type_id=None,
                    )
                )

        for crop in crops.values():
            for code, name, name_hi, order in stages_generic:
                exists = (
                    db.query(GrowthStage)
                    .filter(GrowthStage.code == code, GrowthStage.crop_type_id == crop.id)
                    .first()
                )
                if not exists:
                    db.add(
                        GrowthStage(
                            code=code,
                            name=name,
                            name_hi=name_hi,
                            sequence_order=order,
                            crop_type_id=crop.id,
                        )
                    )
        db.flush()

        # Damage categories
        damages = [
            ("healthy", "Healthy / No visible damage", "स्वस्थ", "none", 0),
            ("lodging", "Lodging", "गिरना / लेटना", "medium", 1),
            ("flood", "Flood damage", "बाढ़ क्षति", "high", 2),
            ("waterlogging", "Waterlogging", "जलभराव", "medium", 3),
            ("drought_stress", "Drought / Water stress", "सूखा तनाव", "medium", 4),
            ("pest", "Pest damage", "कीट क्षति", "medium", 5),
            ("disease", "Disease symptoms", "रोग लक्षण", "medium", 6),
            ("hail_storm", "Hail / Storm damage", "ओलावृष्टि / तूफ़ान", "high", 7),
            ("fire", "Fire damage", "आग क्षति", "high", 8),
            ("nutrient_deficiency", "Nutrient deficiency", "पोषक तत्व कमी", "low", 9),
            ("weed_pressure", "Weed pressure", "खरपतवार", "low", 10),
            ("unknown", "Unknown / Inconclusive", "अज्ञात", "low", 11),
        ]
        for code, name, name_hi, sev, order in damages:
            if not db.query(DamageCategory).filter(DamageCategory.code == code).first():
                db.add(
                    DamageCategory(
                        code=code,
                        name=name,
                        name_hi=name_hi,
                        severity_default=sev,
                        sort_order=order,
                    )
                )

        # Model versions
        if not db.query(ModelVersion).filter(
            ModelVersion.version == "4.0.0-dinov2-v14"
        ).first():
            db.add(
                ModelVersion(
                    name="fasalpramaan-crop-health-dinov2-v14",
                    version="4.0.0-dinov2-v14",
                    adapter_type="crop_health_v4",
                    is_active=True,
                    is_production_validated=False,
                    notes=(
                        "Default local crop-health MVP. Internal frozen gates passed; "
                        "independent field validation and human review remain required."
                    ),
                    metadata_json={
                        "screening_grades": ["A", "B", "C", "U"],
                        "promotion_status": (
                            "internal_frozen_gates_passed_pending_independent_field_governance"
                        ),
                        "rollback_adapter": "crop_health_v3",
                        "severity_estimation": False,
                        "affected_area_estimation": False,
                    },
                )
            )
        if not db.query(ModelVersion).filter(ModelVersion.version == "1.0.0-mock").first():
            db.add(
                ModelVersion(
                    name="fasalpramaan-crop-damage",
                    version="1.0.0-mock",
                    adapter_type="mock",
                    is_active=False,
                    is_production_validated=False,
                    notes="Deterministic development adapter. NOT for insurance decisions.",
                    metadata_json={"disclaimer": "NON-PRODUCTION"},
                )
            )
        if not db.query(ModelVersion).filter(ModelVersion.version == "0.1.0-baseline").first():
            db.add(
                ModelVersion(
                    name="fasalpramaan-crop-damage",
                    version="0.1.0-baseline",
                    adapter_type="baseline",
                    is_active=False,
                    is_production_validated=False,
                    notes="Baseline CV heuristics. NOT production-validated.",
                )
            )

        # Settings
        defaults = {
            "ai_confidence_threshold": {"value": 0.55},
            "required_capture_angles": {
                "angles": ["wide_field", "mid_canopy", "closeup_damage"]
            },
            "gps_accuracy_limit_meters": {"value": 50},
            "branding": {
                "app_name": "FasalPramaan",
                "full_name": "FasalPramaan AI – Smart Crop Evidence and Assessment Platform",
                "dashboard": "FasalPramaan Command Centre",
                "tagline_en": "Capture. Verify. Protect.",
                "tagline_hi": "हर फसल का डिजिटल प्रमाण",
            },
        }
        for key, value in defaults.items():
            if not db.query(SystemSetting).filter(SystemSetting.key == key).first():
                db.add(SystemSetting(key=key, value_json=value, updated_by=admin.id))

        # Farm / plot / cycle
        farm = db.query(Farm).filter(Farm.farmer_id == farmer_profile.id, Farm.name == "Patel Family Farm").first()
        if not farm:
            farm = Farm(
                farmer_id=farmer_profile.id,
                name="Patel Family Farm",
                village_id=village.id,
                total_area_hectares=2.4,
                notes="Synthetic demo farm",
                created_by=farmer_user.id,
            )
            db.add(farm)
            db.flush()

        plot = db.query(Plot).filter(Plot.farm_id == farm.id, Plot.name == "North Field").first()
        if not plot:
            # Small square around demo point
            lon, lat = 77.4125, 23.2615
            delta = 0.001
            ring = [
                [lon - delta, lat - delta],
                [lon + delta, lat - delta],
                [lon + delta, lat + delta],
                [lon - delta, lat + delta],
                [lon - delta, lat - delta],
            ]
            plot = Plot(
                farm_id=farm.id,
                name="North Field",
                survey_number="SN-42/1",
                area_hectares=1.1,
                boundary=polygon_from_ring(ring),
                centroid=point_wkt(lon, lat),
                soil_type="loam",
                irrigation_type="canal",
            )
            db.add(plot)
            db.flush()

        # Keep the presentation data inside the public ViT model's declared
        # support boundary. Paddy is represented by the model's rice labels.
        demo_crop = crops["paddy"]
        stage = (
            db.query(GrowthStage)
            .filter(GrowthStage.code == "vegetative", GrowthStage.crop_type_id == demo_crop.id)
            .first()
        )
        cycle = (
            db.query(CropCycle)
            .filter(
                CropCycle.plot_id == plot.id,
                CropCycle.crop_type_id == demo_crop.id,
                CropCycle.season_year == 2026,
            )
            .first()
        )
        if not cycle:
            cycle = CropCycle(
                plot_id=plot.id,
                crop_type_id=demo_crop.id,
                season_year=2026,
                season="kharif",
                sowing_date=date(2026, 6, 15),
                expected_harvest_date=date(2026, 10, 20),
                current_growth_stage_id=stage.id if stage else None,
                status="active",
                insurance_policy_ref="PMFBY-DEMO-2026-0001",
            )
            db.add(cycle)
            db.flush()

        # Sample submissions
        ensure_bucket()

        def make_submission(status: str, severity: str | None, damage: str, lat_off: float, lon_off: float, key: str):
            existing = db.query(Submission).filter(Submission.idempotency_key == key).first()
            if existing:
                return existing
            lat = 23.2615 + lat_off
            lon = 77.4125 + lon_off
            sub = Submission(
                crop_cycle_id=cycle.id,
                submitted_by=farmer_user.id,
                growth_stage_id=stage.id if stage else None,
                status=status,
                capture_lat=lat,
                capture_lon=lon,
                capture_accuracy_m=8.5,
                capture_timestamp=datetime.now(timezone.utc) - timedelta(days=1),
                capture_location=point_wkt(lon, lat),
                farmer_observations="Synthetic demo observation",
                idempotency_key=key,
                device_id="demo-device-android",
                offline_created=False,
                finalized_at=datetime.now(timezone.utc) - timedelta(hours=20),
                severity=severity,
                final_severity=severity if status == "verified" else None,
            )
            db.add(sub)
            db.flush()
            for i, angle in enumerate(["wide_field", "mid_canopy", "closeup_damage"]):
                object_key = f"evidence/demo/{key}/{angle}.jpg"
                payload = synthetic_demo_jpeg(key, angle)
                put_bytes(object_key, payload)
                sha = hashlib.sha256(payload).hexdigest()
                db.add(
                    SubmissionImage(
                        submission_id=sub.id,
                        angle_type=angle,
                        sequence_order=i,
                        object_key=object_key,
                        content_type="image/jpeg",
                        byte_size=len(payload),
                        sha256=sha,
                        perceptual_hash=sha[:16],
                        upload_status="uploaded",
                        capture_lat=lat,
                        capture_lon=lon,
                        capture_accuracy_m=8.5,
                        captured_at=sub.capture_timestamp,
                    )
                )
            if status in ("pending_review", "verified", "physical_inspection", "needs_recapture"):
                job = AIJob(
                    submission_id=sub.id,
                    status="completed",
                    started_at=datetime.now(timezone.utc) - timedelta(hours=19),
                    completed_at=datetime.now(timezone.utc) - timedelta(hours=19, minutes=-2),
                )
                db.add(job)
                db.flush()
                predicted_signal = (
                    "healthy"
                    if damage == "healthy"
                    else ("unknown" if damage == "unknown" else "disease")
                )
                scores = {d[0]: 0.0 for d in damages}
                scores[predicted_signal] = 0.82
                scores["unknown"] = max(scores["unknown"], 0.1)
                predicted_grade = (
                    "A"
                    if predicted_signal == "healthy"
                    else ("U" if predicted_signal == "unknown" else "C")
                )
                grade_scores = {
                    "healthy_signal": 0.82 if predicted_signal == "healthy" else 0.05,
                    "disease_signal": 0.82 if predicted_signal == "disease" else 0.05,
                    "invalid_or_ood": 0.9 if predicted_signal == "unknown" else 0.1,
                }
                db.add(
                    AIPrediction(
                        ai_job_id=job.id,
                        submission_id=sub.id,
                        model_version="synthetic-seed-v1",
                        adapter_type="mock",
                        is_production_validated=False,
                        predicted_crop="paddy",
                        crop_confidence=0.78,
                        predicted_growth_stage="vegetative",
                        growth_stage_confidence=0.7,
                        predicted_grade=predicted_grade,
                        grade_label=(
                            "healthy_leaf_signal"
                            if predicted_signal == "healthy"
                            else (
                                "unusable_or_out_of_domain"
                                if predicted_signal == "unknown"
                                else "disease_pattern_signal"
                            )
                        ),
                        grade_confidence=0.74,
                        grade_scores=grade_scores,
                        damage_scores=scores,
                        primary_damage=predicted_signal,
                        affected_area_pct=None,
                        severity=None,
                        overall_confidence=0.74,
                        quality_warnings=[],
                        anomaly_flags=[],
                        human_review_recommendation="normal_review",
                        explanation={
                            "disclaimer": (
                                "SYNTHETIC NON-PRODUCTION workflow fixture; "
                                "not a crop_health_v4 inference"
                            ),
                            "method": "seed_data",
                        },
                        raw_response={"seed": True},
                        processing_duration_ms=120,
                    )
                )
            return sub

        make_submission("pending_review", "medium", "pest", 0.0002, 0.0001, "seed-sub-pending-001")
        make_submission("verified", "low", "healthy", -0.0003, 0.0002, "seed-sub-verified-001")
        high = make_submission("pending_review", "high", "flood", 0.0004, -0.0002, "seed-sub-high-001")
        make_submission("needs_recapture", None, "unknown", 0.0001, 0.0003, "seed-sub-recapture-001")

        # A reused demo volume may have had every pending item reviewed. Keep
        # exactly one seed item available without reopening completed reviews.
        presentation_pending = (
            db.query(Submission)
            .filter(
                Submission.idempotency_key.like("seed-sub-vit-pending-%"),
                Submission.status == "pending_review",
            )
            .first()
        )
        if not presentation_pending:
            presentation_count = (
                db.query(Submission)
                .filter(Submission.idempotency_key.like("seed-sub-vit-pending-%"))
                .count()
            )
            make_submission(
                "pending_review",
                "medium",
                "pest",
                0.00025,
                0.00015,
                f"seed-sub-vit-pending-{presentation_count + 1:03d}",
            )

        # Backfill the new screening fields when an existing demo volume is
        # upgraded instead of recreated. These remain visibly mock seed data.
        seed_predictions = (
            db.query(AIPrediction)
            .join(Submission, Submission.id == AIPrediction.submission_id)
            .filter(Submission.idempotency_key.like("seed-sub-%"))
            .all()
        )
        for prediction in seed_predictions:
            if prediction.predicted_grade is not None:
                continue
            healthy = prediction.primary_damage == "healthy"
            prediction.predicted_grade = "A" if healthy else "C"
            prediction.grade_label = (
                "healthy_leaf_signal" if healthy else "disease_pattern_signal"
            )
            prediction.grade_confidence = 0.74
            prediction.grade_scores = {
                "healthy_signal": 0.82 if healthy else 0.08,
                "disease_signal": 0.08 if healthy else 0.82,
                "invalid_or_ood": 0.1,
            }

        if high and not db.query(Alert).filter(Alert.submission_id == high.id).first():
            db.add(
                Alert(
                    alert_type="high_severity_damage",
                    severity="high",
                    title="High-severity flood indicators (demo)",
                    message="Synthetic high-severity case for Command Centre demo",
                    jurisdiction_id=district.id,
                    submission_id=high.id,
                )
            )

        if not db.query(Notification).filter(Notification.user_id == farmer_user.id).first():
            db.add(
                Notification(
                    user_id=farmer_user.id,
                    event_type="welcome",
                    title="Welcome to FasalPramaan",
                    body="Capture. Verify. Protect. — Digital evidence for every crop.",
                    title_hi="फसल प्रमाण में आपका स्वागत है",
                    body_hi="हर फसल का डिजिटल प्रमाण",
                    channel="in_app",
                )
            )

        db.commit()
        logger.info("Seed completed successfully")
        logger.info("Synthetic local accounts seeded; credentials are sourced from DEMO_PASSWORD")
    except Exception:
        db.rollback()
        logger.exception("Seed failed")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
