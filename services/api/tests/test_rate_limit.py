"""Local MVP: rate limits stay off so demo traffic is never 429'd."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.rate_limit import limiter


def test_rate_limit_disabled_by_default():
    assert get_settings().rate_limit_enabled is False


def test_limiter_check_is_noop_when_disabled():
    for _ in range(40):
        limiter.check("auth:mvp-demo", 1, 60)


def test_auth_and_api_paths_never_return_429(client: TestClient):
    for index in range(40):
        login = client.post(
            "/api/v1/auth/login",
            json={"email": f"nobody{index}@fasalpramaan.local", "password": "wrong"},
        )
        assert login.status_code != 429, login.text
        assert login.status_code in {401, 422}
    crops = client.get("/api/v1/crops")
    assert crops.status_code != 429, crops.text
