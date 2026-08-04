"""Shared API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageOut(BaseModel):
    message: str
    detail: Optional[str] = None


class ErrorOut(BaseModel):
    error: str
    detail: Optional[Any] = None
    correlation_id: Optional[str] = None


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int = 1
    page_size: int = 20
    pages: int = 1


class HealthOut(BaseModel):
    status: str
    service: str
    version: str
    checks: dict[str, str] = Field(default_factory=dict)
    timestamp: datetime
