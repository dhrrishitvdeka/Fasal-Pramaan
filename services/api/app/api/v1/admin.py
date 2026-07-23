"""Administration endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import joinedload

from app.core.config import get_settings
from app.core.deps import ROLE_ADMIN, CurrentUser, DbSession, require_roles
from app.db.models import (
    AuditLog,
    DamageCategory,
    Jurisdiction,
    ModelVersion,
    SystemSetting,
    User,
    UserRole,
)
from app.schemas.common import MessageOut
from app.services.audit import write_audit

router = APIRouter(prefix="/admin", tags=["Administration"])

SETTING_KEYS = {
    "ai_confidence_threshold",
    "required_capture_angles",
    "gps_accuracy_limit_meters",
    "branding",
}


@router.get("/users")
def list_users(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_ADMIN)),
) -> list[dict]:
    users = (
        db.query(User)
        .options(joinedload(User.roles).joinedload(UserRole.role))
        .filter(User.is_deleted.is_(False))
        .order_by(User.created_at.desc())
        .limit(500)
        .all()
    )
    result = []
    for u in users:
        roles = [ur.role.code for ur in u.roles if ur.role]
        result.append(
            {
                "id": str(u.id),
                "email": u.email,
                "full_name": u.full_name,
                "is_active": u.is_active,
                "roles": roles,
            }
        )
    return result


@router.get("/jurisdictions")
def list_jurisdictions(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_ADMIN, "reviewer")),
) -> list[dict]:
    rows = db.query(Jurisdiction).filter(Jurisdiction.is_deleted.is_(False)).order_by(Jurisdiction.level, Jurisdiction.name).all()
    return [
        {
            "id": str(j.id),
            "code": j.code,
            "name": j.name,
            "name_hi": j.name_hi,
            "level": j.level,
            "parent_id": str(j.parent_id) if j.parent_id else None,
        }
        for j in rows
    ]


@router.get("/damage-categories")
def list_damage_categories(db: DbSession, user: CurrentUser) -> list[dict]:
    rows = db.query(DamageCategory).filter(DamageCategory.is_deleted.is_(False)).order_by(DamageCategory.sort_order).all()
    return [
        {"id": str(d.id), "code": d.code, "name": d.name, "name_hi": d.name_hi, "severity_default": d.severity_default}
        for d in rows
    ]


@router.get("/model-versions")
def list_models(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_ADMIN)),
) -> list[dict]:
    rows = db.query(ModelVersion).order_by(ModelVersion.created_at.desc()).all()
    return [
        {
            "id": str(m.id),
            "name": m.name,
            "version": m.version,
            "adapter_type": m.adapter_type,
            "is_active": m.is_active,
            "is_production_validated": m.is_production_validated,
            "notes": m.notes,
        }
        for m in rows
    ]


@router.get("/settings")
def get_settings_admin(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_ADMIN)),
) -> list[dict]:
    rows = db.query(SystemSetting).all()
    return [{"key": s.key, "value": s.value_json, "description": s.description} for s in rows]


@router.put("/settings/{key}")
def put_setting(
    key: str,
    body: dict,
    db: DbSession,
    user: User = Depends(require_roles(ROLE_ADMIN)),
) -> MessageOut:
    if key not in SETTING_KEYS:
        raise HTTPException(400, "Unsupported setting key")
    value = body.get("value", body)
    if not isinstance(value, dict):
        raise HTTPException(400, "Setting value must be a JSON object")
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    before = row.value_json if row else None
    if row:
        row.value_json = value
        row.updated_by = user.id
    else:
        db.add(SystemSetting(key=key, value_json=value, updated_by=user.id))
    write_audit(
        db,
        action="update_setting",
        entity_type="system_setting",
        entity_id=key,
        actor_id=user.id,
        before=before,
        after=value,
    )
    db.commit()
    return MessageOut(message="Setting updated")


@router.get("/audit-logs")
def audit_logs(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_ADMIN)),
    limit: int = Query(100, ge=1, le=500),
) -> list[dict]:
    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": str(a.id),
            "action": a.action,
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "actor_id": str(a.actor_id) if a.actor_id else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "notes": a.notes,
        }
        for a in rows
    ]


@router.get("/health-summary")
def health_summary(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_ADMIN)),
) -> dict:
    settings = get_settings()
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {
        "database": "ok" if db_ok else "error",
        "environment": settings.environment,
        "ai_adapter": settings.ai_model_adapter,
        "project": settings.project_name,
    }
