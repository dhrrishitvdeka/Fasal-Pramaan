"""FastAPI dependencies: auth, roles, db."""

from __future__ import annotations

from typing import Annotated, Callable
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import false, select
from sqlalchemy.orm import Session, joinedload

from app.core.security import safe_decode
from app.db.models import Farm, FieldOfficerProfile, Jurisdiction, User, UserRole
from app.db.session import SessionLocal, get_db

bearer_scheme = HTTPBearer(auto_error=False)

ROLE_FARMER = "farmer"
ROLE_FIELD_OFFICER = "field_officer"
ROLE_REVIEWER = "reviewer"
ROLE_ADMIN = "administrator"


def get_correlation_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", "-")


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = safe_decode(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = payload.get("sub")
    try:
        uid = UUID(str(user_id))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject") from exc

    user = (
        db.query(User)
        .options(joinedload(User.roles).joinedload(UserRole.role))
        .filter(User.id == uid, User.is_deleted.is_(False))
        .first()
    )
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or missing")
    if payload.get("token_version") != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")
    return user


def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User | None:
    if credentials is None:
        return None
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None


def get_current_user_short_lived(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    """Authenticate without holding a pooled DB connection for a streaming response."""
    db = SessionLocal()
    try:
        user = get_current_user(credentials, db)
        # Force eager relationship materialization before the session closes.
        user_role_codes(user)
        return user
    finally:
        db.close()


def user_role_codes(user: User) -> list[str]:
    return [ur.role.code for ur in user.roles if ur.role]


def is_staff(user: User) -> bool:
    """Administrators, reviewers, and field officers may access cross-farmer resources."""
    return bool(
        set(user_role_codes(user)).intersection(
            {ROLE_ADMIN, ROLE_REVIEWER, ROLE_FIELD_OFFICER}
        )
    )


def field_officer_jurisdiction_ids(db: Session, user: User):
    """Recursive jurisdiction selector for the officer's assigned roots and descendants."""
    roots = {
        value
        for (value,) in db.query(UserRole.jurisdiction_id)
        .filter(UserRole.user_id == user.id, UserRole.jurisdiction_id.isnot(None))
        .all()
        if value is not None
    }
    profile = db.query(FieldOfficerProfile).filter(
        FieldOfficerProfile.user_id == user.id,
        FieldOfficerProfile.is_deleted.is_(False),
    ).first()
    if profile and profile.jurisdiction_id:
        roots.add(profile.jurisdiction_id)
    if not roots:
        return None
    tree = select(Jurisdiction.id).where(
        Jurisdiction.id.in_(roots),
        Jurisdiction.is_deleted.is_(False),
    ).cte(name="officer_jurisdictions", recursive=True)
    tree = tree.union_all(
        select(Jurisdiction.id).join(tree, Jurisdiction.parent_id == tree.c.id).where(
            Jurisdiction.is_deleted.is_(False)
        )
    )
    return select(tree.c.id)


def field_officer_farm_filter(db: Session, user: User):
    ids = field_officer_jurisdiction_ids(db, user)
    return false() if ids is None else Farm.village_id.in_(ids)


def field_officer_can_access_jurisdiction(db: Session, user: User, jurisdiction_id) -> bool:
    ids = field_officer_jurisdiction_ids(db, user)
    if ids is None or jurisdiction_id is None:
        return False
    return db.query(Jurisdiction.id).filter(Jurisdiction.id == jurisdiction_id, Jurisdiction.id.in_(ids)).first() is not None


def require_roles(*allowed: str) -> Callable:
    def checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        codes = set(user_role_codes(user))
        if not codes.intersection(set(allowed)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(allowed)}",
            )
        return user

    return checker


CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]
