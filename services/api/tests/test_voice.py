"""Security and request-shape tests for Gemini Live token provisioning."""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.services import gemini_live


class _FakeResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, str]:
        return {"name": "auth_tokens/one-use-demo-token"}


class _FakeClient:
    last_request: dict | None = None

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None

    def post(self, url, *, headers, json):
        _FakeClient.last_request = {"url": url, "headers": headers, "json": json}
        return _FakeResponse()


class _TransientResponse(_FakeResponse):
    def __init__(self, status_code: int):
        self.status_code = status_code

    def raise_for_status(self) -> None:
        request = gemini_live.httpx.Request("POST", gemini_live.GEMINI_AUTH_TOKENS_URL)
        response = gemini_live.httpx.Response(self.status_code, request=request)
        raise gemini_live.httpx.HTTPStatusError(
            "upstream failure",
            request=request,
            response=response,
        )


class _RetryClient(_FakeClient):
    attempts = 0

    def post(self, url, *, headers, json):
        _RetryClient.attempts += 1
        if _RetryClient.attempts < 3:
            return _TransientResponse(503)
        return super().post(url, headers=headers, json=json)


def test_voice_feature_is_disabled_by_default():
    with pytest.raises(gemini_live.GeminiLiveUnavailable, match="not enabled"):
        gemini_live.create_ephemeral_session(
            Settings(voice_assistant_enabled=False, gemini_api_key="")
        )


def test_ephemeral_token_is_one_use_and_configuration_locked(monkeypatch):
    monkeypatch.setattr(gemini_live.httpx, "Client", _FakeClient)
    settings = Settings(
        voice_assistant_enabled=True,
        gemini_api_key="server-only-key",
        gemini_live_session_minutes=20,
    )

    session = gemini_live.create_ephemeral_session(settings)

    assert session.token == "auth_tokens/one-use-demo-token"
    assert "server-only-key" not in session.websocket_url
    request = _FakeClient.last_request
    assert request is not None
    assert "/v1alpha/auth_tokens" in request["url"]
    assert request["headers"]["x-goog-api-key"] == "server-only-key"
    token = request["json"]
    assert token["uses"] == 1
    setup = token["bidiGenerateContentSetup"]
    assert setup["model"] == "models/gemini-3.1-flash-live-preview"
    assert setup["generationConfig"]["responseModalities"] == ["AUDIO"]
    declarations = setup["tools"][0]["functionDeclarations"]
    assert {item["name"] for item in declarations} >= {
        "list_my_farms",
        "change_language",
        "capture_current_angle",
        "save_guided_capture_offline",
        "prepare_finalize_submission",
        "prepare_create_farm",
        "prepare_update_evidence_reminder",
        "prepare_logout",
        "confirm_pending_action",
    }


def test_session_token_response_advertises_proxy(client, monkeypatch, farmer_token):
    """Browser clients should prefer the same-origin /voice/live proxy."""
    from app.api.v1 import voice as voice_routes
    from app.services.gemini_live import GEMINI_LIVE_WEBSOCKET_URL, GeminiEphemeralSession
    from datetime import datetime, timedelta, timezone
    from uuid import uuid4

    # voice.py binds create_ephemeral_session at import time — patch the route module.
    monkeypatch.setattr(
        voice_routes,
        "create_ephemeral_session",
        lambda settings: GeminiEphemeralSession(
            token="auth_tokens/proxy-demo",
            model="gemini-3.1-flash-live-preview",
            websocket_url=GEMINI_LIVE_WEBSOCKET_URL,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            new_session_expires_at=datetime.now(timezone.utc) + timedelta(minutes=1),
            session_id=uuid4(),
        ),
    )
    response = client.post(
        "/api/v1/voice/session-token",
        headers={"Authorization": f"Bearer {farmer_token}"},
        json={},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["use_proxy"] is True
    assert body["proxy_path"] == "/api/v1/voice/live"
    assert body["model"] == "gemini-3.1-flash-live-preview"


def test_production_voice_feature_requires_server_api_key():
    from test_production_config import _otherwise_safe_production_settings

    settings = _otherwise_safe_production_settings(
        voice_assistant_enabled=True,
        gemini_api_key="",
    )
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
        settings.assert_safe_for_environment()


def test_transient_token_failures_are_retried_without_exposing_key(monkeypatch):
    _RetryClient.attempts = 0
    monkeypatch.setattr(gemini_live.httpx, "Client", _RetryClient)
    monkeypatch.setattr(gemini_live.time, "sleep", lambda _: None)

    session = gemini_live.create_ephemeral_session(
        Settings(
            voice_assistant_enabled=True,
            gemini_api_key="server-only-key",
        )
    )

    assert session.token == "auth_tokens/one-use-demo-token"
    assert _RetryClient.attempts == 3
