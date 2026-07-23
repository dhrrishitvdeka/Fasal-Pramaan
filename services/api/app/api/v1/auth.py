"""Authentication endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, user_role_codes
from app.core.security import (
    create_access_token,
    create_refresh_token_value,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.models import DeviceRecord, FarmerProfile, RefreshToken, Role, User, UserRole
from app.schemas.auth import (
    DeviceRegisterRequest,
    LoginRequest,
    OTPRequest,
    OTPVerifyRequest,
    PasswordRecoveryRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.schemas.common import MessageOut
from app.services.audit import write_audit

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Development OTP store (in-memory) — not for production
_DEV_OTPS: dict[str, tuple[str, datetime, int]] = {}
_DUMMY_PASSWORD_HASH = hash_password("invalid-account-timing-equalizer")


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        preferred_language=user.preferred_language,
        is_active=user.is_active,
        is_verified=user.is_verified,
        roles=user_role_codes(user),
        last_login_at=user.last_login_at,
    )


def _issue_tokens(
    db: DbSession,
    user: User,
    device_id: str | None = None,
    family_id=None,
    rotated_from: RefreshToken | None = None,
) -> TokenResponse:
    settings = get_settings()
    roles = user_role_codes(user)
    access = create_access_token(user.id, roles, extra={"token_version": user.token_version})
    refresh = create_refresh_token_value()
    refresh_hash = hash_token(refresh)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
            device_id=device_id,
            family_id=family_id or uuid.uuid4(),
        )
    )
    if rotated_from is not None:
        rotated_from.replaced_by_token_hash = refresh_hash
    db.commit()
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, db: DbSession, request: Request) -> TokenResponse:
    # Farmer-only public registration. Staff roles (field_officer, reviewer,
    # administrator) grant cross-farmer access and must never be self-assigned.
    if body.role != "farmer":
        raise HTTPException(
            status_code=400,
            detail="Self-registration is limited to farmer accounts",
        )
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    role = db.query(Role).filter(Role.code == "farmer").first()
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role")
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        phone=body.phone,
        preferred_language=body.preferred_language,
        is_verified=False,
    )
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    code = f"F-{user.id.hex[:8].upper()}"
    db.add(FarmerProfile(user_id=user.id, farmer_code=code))
    write_audit(
        db,
        action="register",
        entity_type="user",
        entity_id=str(user.id),
        actor_id=user.id,
        after={"email": user.email, "role": "farmer"},
        ip_address=request.client.host if request.client else None,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered") from exc
    user = (
        db.query(User)
        .options(joinedload(User.roles).joinedload(UserRole.role))
        .filter(User.id == user.id)
        .one()
    )
    return _issue_tokens(db, user)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: DbSession, request: Request) -> TokenResponse:
    user = (
        db.query(User)
        .options(joinedload(User.roles).joinedload(UserRole.role))
        .filter(User.email == body.email.lower(), User.is_deleted.is_(False))
        .first()
    )
    if not user:
        verify_password(body.password, _DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(status_code=423, detail="Account temporarily locked")
    if not verify_password(body.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)
    write_audit(
        db,
        action="login",
        entity_type="user",
        entity_id=str(user.id),
        actor_id=user.id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return _issue_tokens(db, user, body.device_id)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: DbSession) -> TokenResponse:
    th = hash_token(body.refresh_token)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == th).with_for_update().first()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if row.revoked_at is not None:
        now = datetime.now(timezone.utc)
        db.query(RefreshToken).filter(
            RefreshToken.family_id == row.family_id,
            RefreshToken.revoked_at.is_(None),
        ).update({RefreshToken.revoked_at: now}, synchronize_session=False)
        db.commit()
        raise HTTPException(status_code=401, detail="Refresh token reuse detected; session family revoked")
    if row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired")
    # Rotation: revoke old
    row.revoked_at = datetime.now(timezone.utc)
    user = (
        db.query(User)
        .options(joinedload(User.roles).joinedload(UserRole.role))
        .filter(User.id == row.user_id, User.is_deleted.is_(False))
        .first()
    )
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User inactive")
    return _issue_tokens(db, user, row.device_id, family_id=row.family_id, rotated_from=row)


@router.post("/logout", response_model=MessageOut)
def logout(body: RefreshRequest, db: DbSession, user: CurrentUser) -> MessageOut:
    th = hash_token(body.refresh_token)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == th, RefreshToken.user_id == user.id).first()
    if row:
        now = datetime.now(timezone.utc)
        db.query(RefreshToken).filter(
            RefreshToken.family_id == row.family_id,
            RefreshToken.revoked_at.is_(None),
        ).update({RefreshToken.revoked_at: now}, synchronize_session=False)
    user.token_version += 1
    db.commit()
    return MessageOut(message="Logged out")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return _user_out(user)


@router.post("/otp/request", response_model=MessageOut)
def otp_request(body: OTPRequest) -> MessageOut:
    settings = get_settings()
    if settings.environment not in ("development", "test", "local"):
        raise HTTPException(
            status_code=501,
            detail="OTP provider not configured for this environment",
        )
    # Development provider only — fixed OTP must never ship to production SMS.
    now = datetime.now(timezone.utc)
    for phone, (_, expires_at, _) in list(_DEV_OTPS.items()):
        if expires_at <= now:
            _DEV_OTPS.pop(phone, None)
    _DEV_OTPS[body.phone] = ("123456", now + timedelta(minutes=5), 0)
    return MessageOut(message="OTP sent (development provider)", detail="Use OTP 123456 in development")


@router.post("/otp/verify", response_model=MessageOut)
def otp_verify(body: OTPVerifyRequest) -> MessageOut:
    settings = get_settings()
    if settings.environment not in ("development", "test", "local"):
        raise HTTPException(
            status_code=501,
            detail="OTP provider not configured for this environment",
        )
    record = _DEV_OTPS.get(body.phone)
    now = datetime.now(timezone.utc)
    if record is None or record[1] <= now or record[2] >= 5:
        _DEV_OTPS.pop(body.phone, None)
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    expected, expires_at, attempts = record
    if body.otp != expected:
        _DEV_OTPS[body.phone] = (expected, expires_at, attempts + 1)
        raise HTTPException(status_code=400, detail="Invalid OTP")
    _DEV_OTPS.pop(body.phone, None)
    return MessageOut(message="OTP verified")


@router.post("/password-recovery", response_model=MessageOut)
def password_recovery(body: PasswordRecoveryRequest) -> MessageOut:
    # Always same response (no account enumeration); never echo the email back
    return MessageOut(
        message="If an account exists and recovery is configured, instructions will be sent",
    )


@router.post("/devices", response_model=MessageOut)
def register_device(body: DeviceRegisterRequest, db: DbSession, user: CurrentUser) -> MessageOut:
    existing = (
        db.query(DeviceRecord)
        .filter(DeviceRecord.user_id == user.id, DeviceRecord.device_id == body.device_id)
        .first()
    )
    if existing:
        existing.platform = body.platform
        existing.model = body.model
        existing.os_version = body.os_version
        existing.app_version = body.app_version
        existing.push_token = body.push_token
        existing.last_seen_at = datetime.now(timezone.utc)
    else:
        db.add(
            DeviceRecord(
                user_id=user.id,
                device_id=body.device_id,
                platform=body.platform,
                model=body.model,
                os_version=body.os_version,
                app_version=body.app_version,
                push_token=body.push_token,
                last_seen_at=datetime.now(timezone.utc),
            )
        )
    db.commit()
    return MessageOut(message="Device registered")
