"""Pytest fixtures for API tests."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

# Ensure test env before app import
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://fasalpramaan:fasalpramaan_dev_only@localhost:5432/fasalpramaan",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-long-enough")
os.environ.setdefault("AI_SERVICE_URL", "http://localhost:8001")
os.environ.setdefault("MINIO_ENDPOINT", "localhost:9000")
os.environ.setdefault("MINIO_PUBLIC_ENDPOINT", "localhost:9000")
# Suite uses shared TestClient IP — avoid false 429s during authz/submission runs
os.environ["RATE_LIMIT_PER_MINUTE"] = os.environ.get("RATE_LIMIT_PER_MINUTE", "10000")


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    from app.core.rate_limit import limiter

    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture(scope="session")
def client():
    from app.core.config import get_settings

    get_settings.cache_clear()
    from app.main import app

    # Middleware reads module-level settings captured at import; refresh if possible
    import app.main as main_mod

    main_mod.settings = get_settings()

    with TestClient(app) as c:
        yield c


@pytest.fixture
def farmer_token(client: TestClient) -> str:
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "farmer@fasalpramaan.local", "password": os.getenv("DEMO_PASSWORD", "Demo@12345")},
    )
    if r.status_code != 200:
        pytest.skip(f"Seed data not available: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture
def reviewer_token(client: TestClient) -> str:
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "reviewer@fasalpramaan.local", "password": os.getenv("DEMO_PASSWORD", "Demo@12345")},
    )
    if r.status_code != 200:
        pytest.skip(f"Seed data not available: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture
def admin_token(client: TestClient) -> str:
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@fasalpramaan.local", "password": os.getenv("DEMO_PASSWORD", "Demo@12345")},
    )
    if r.status_code != 200:
        pytest.skip(f"Seed data not available: {r.status_code} {r.text}")
    return r.json()["access_token"]
