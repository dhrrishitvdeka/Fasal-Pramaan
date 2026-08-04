"""Bootstrap demo accounts and required reference catalogs only."""

from __future__ import annotations

import logging
import os
import sys

from sqlalchemy import text

from app.core.security import hash_password
from app.db.models import (
    CropType,
    DamageCategory,
    FarmerProfile,
    FieldOfficerProfile,
    GrowthStage,
    ModelVersion,
    Role,
    SystemSetting,
    User,
    UserRole,
)
from app.db.session import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed")

DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "Demo@12345")


def ensure_roles(db) -> dict[str, Role]:
    roles: dict[str, Role] = {}
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


def ensure_user(db, email: str, full_name: str, role: Role) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # password_hash is NOT NULL — set it before the first flush/insert.
        user = User(
            email=email,
            full_name=full_name,
            password_hash=hash_password(DEMO_PASSWORD),
            preferred_language="hi" if role.code == "farmer" else "en",
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.flush()
    else:
        user.full_name = full_name
        user.phone = None
        # Backfill only if missing; avoid re-hashing every seed run.
        if not user.password_hash:
            user.password_hash = hash_password(DEMO_PASSWORD)
        user.preferred_language = "hi" if role.code == "farmer" else "en"
        user.is_active = True
        user.is_verified = True

    user_role = (
        db.query(UserRole)
        .filter(UserRole.user_id == user.id, UserRole.role_id == role.id)
        .first()
    )
    if not user_role:
        user_role = UserRole(user_id=user.id, role_id=role.id)
        db.add(user_role)
    user_role.jurisdiction_id = None
    return user


def seed() -> None:
    db = SessionLocal()
    try:
        db.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        db.commit()

        roles = ensure_roles(db)
        admin = ensure_user(
            db, "admin@fasalpramaan.local", "Demo Administrator", roles["administrator"]
        )
        ensure_user(db, "reviewer@fasalpramaan.local", "Demo Reviewer", roles["reviewer"])
        officer = ensure_user(
            db, "officer@fasalpramaan.local", "Demo Field Officer", roles["field_officer"]
        )
        farmer = ensure_user(db, "farmer@fasalpramaan.local", "Demo Farmer", roles["farmer"])
        db.flush()

        farmer_profile = (
            db.query(FarmerProfile).filter(FarmerProfile.user_id == farmer.id).first()
        )
        if not farmer_profile:
            farmer_profile = FarmerProfile(user_id=farmer.id, farmer_code="F-LOCAL0001")
            db.add(farmer_profile)
        farmer_profile.farmer_code = "F-LOCAL0001"
        farmer_profile.village_id = None
        farmer_profile.aadhaar_last4 = None
        farmer_profile.address_line = None

        officer_profile = (
            db.query(FieldOfficerProfile)
            .filter(FieldOfficerProfile.user_id == officer.id)
            .first()
        )
        if not officer_profile:
            officer_profile = FieldOfficerProfile(
                user_id=officer.id, employee_code="O-LOCAL0001"
            )
            db.add(officer_profile)
        officer_profile.employee_code = "O-LOCAL0001"
        officer_profile.jurisdiction_id = None
        officer_profile.designation = "Field Officer"

        crop_definitions = [
            ("paddy", "Paddy / Rice", "धान", "kharif"),
            ("wheat", "Wheat", "गेहूँ", "rabi"),
            ("soybean", "Soybean", "सोयाबीन", "kharif"),
            ("cotton", "Cotton", "कपास", "kharif"),
            ("maize", "Maize", "मक्का", "kharif"),
        ]
        crops: dict[str, CropType] = {}
        for code, name, name_hi, season in crop_definitions:
            crop = db.query(CropType).filter(CropType.code == code).first()
            if not crop:
                crop = CropType(code=code, name=name, name_hi=name_hi, season=season)
                db.add(crop)
                db.flush()
            crops[code] = crop

        stages = [
            ("sowing", "Sowing / Germination", "बुवाई", 1),
            ("vegetative", "Vegetative", "वृद्धि", 2),
            ("flowering", "Flowering", "फूलना", 3),
            ("grain_filling", "Grain Filling", "दाना भरना", 4),
            ("maturity", "Maturity", "पकना", 5),
        ]
        for crop_type_id in [None, *(crop.id for crop in crops.values())]:
            for code, name, name_hi, order in stages:
                stage = (
                    db.query(GrowthStage)
                    .filter(
                        GrowthStage.code == code,
                        GrowthStage.crop_type_id == crop_type_id,
                    )
                    .first()
                )
                if not stage:
                    db.add(
                        GrowthStage(
                            code=code,
                            name=name,
                            name_hi=name_hi,
                            sequence_order=order,
                            crop_type_id=crop_type_id,
                        )
                    )

        damage_categories = [
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
        for code, name, name_hi, severity, order in damage_categories:
            if not db.query(DamageCategory).filter(DamageCategory.code == code).first():
                db.add(
                    DamageCategory(
                        code=code,
                        name=name,
                        name_hi=name_hi,
                        severity_default=severity,
                        sort_order=order,
                    )
                )

        if not db.query(ModelVersion).filter(ModelVersion.version == "4.0.0-dinov2-v14").first():
            db.add(
                ModelVersion(
                    name="fasalpramaan-crop-health-dinov2-v14",
                    version="4.0.0-dinov2-v14",
                    adapter_type="crop_health_v4",
                    is_active=True,
                    is_production_validated=False,
                    notes=(
                        "Default local crop-health classifier. Internal frozen gates passed; "
                        "independent field validation and human review remain required."
                    ),
                    metadata_json={
                        "screening_grades": ["A", "B", "C", "U"],
                        "promotion_status": "internal_frozen_gates_passed_pending_independent_field_governance",
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
                    notes="Deterministic development adapter. Not for insurance decisions.",
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
                    notes="Baseline CV heuristics. Not production-validated.",
                )
            )

        defaults = {
            "ai_confidence_threshold": {"value": 0.55},
            "required_capture_angles": {
                "angles": [
                    "wide_field",
                    "left_context",
                    "mid_canopy",
                    "right_context",
                    "closeup_damage",
                ]
            },
            "gps_accuracy_limit_meters": {"value": 50},
            "branding": {
                "app_name": "FasalPramaan",
                "full_name": "FasalPramaan – Smart Crop Evidence and Assessment Platform",
                "dashboard": "FasalPramaan Command Centre",
                "tagline_en": "Capture. Verify. Protect.",
                "tagline_hi": "हर फसल का डिजिटल प्रमाण",
            },
        }
        for key, value in defaults.items():
            setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if not setting:
                db.add(SystemSetting(key=key, value_json=value, updated_by=admin.id))

        db.commit()
        logger.info("Bootstrap completed successfully")
        logger.info("Demo accounts and local reference catalogs are ready")
    except Exception:
        db.rollback()
        logger.exception("Bootstrap failed")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
