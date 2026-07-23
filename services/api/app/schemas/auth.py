"""Auth request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel


def _normalize_email(value: str) -> str:
    """Accept local-dev domains like *.local that strict EmailStr rejects."""
    email = (value or "").strip().lower()
    if "@" not in email:
        raise ValueError("Invalid email address")
    local, _, domain = email.partition("@")
    if not local or not domain or " " in email:
        raise ValueError("Invalid email address")
    return email


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    phone: Optional[str] = None
    # Self-registration is farmer-only. field_officer / reviewer / administrator
    # are provisioned by seed or admin (staff roles grant cross-farmer access).
    role: str = Field(default="farmer", pattern="^farmer$")
    preferred_language: str = "en"
    village_code: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _normalize_email(value)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if len(value) < 10:
            raise ValueError("Password must be at least 10 characters")
        if not any(c.islower() for c in value) or not any(c.isupper() for c in value):
            raise ValueError("Password must include upper- and lower-case letters")
        if not any(c.isdigit() for c in value) or not any(not c.isalnum() for c in value):
            raise ValueError("Password must include a number and symbol")
        return value


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str
    device_id: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _normalize_email(value)


class OTPRequest(BaseModel):
    phone: str
    purpose: str = "login"


class OTPVerifyRequest(BaseModel):
    phone: str
    otp: str
    purpose: str = "login"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class RoleOut(ORMModel):
    code: str
    name: str


class UserOut(ORMModel):
    id: UUID
    email: str
    full_name: str
    phone: Optional[str] = None
    preferred_language: str
    is_active: bool
    is_verified: bool
    roles: list[str] = []
    last_login_at: Optional[datetime] = None


class DeviceRegisterRequest(BaseModel):
    device_id: str
    platform: str
    model: Optional[str] = None
    os_version: Optional[str] = None
    app_version: Optional[str] = None
    push_token: Optional[str] = None


class PasswordRecoveryRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _normalize_email(value)
