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


def test_session_token_response_advertises_proxy(client, monkeypatch):
    """Browser clients should prefer the same-origin /voice/live proxy."""
    from unittest.mock import MagicMock
    from datetime import datetime, timedelta, timezone
    from uuid import uuid4
    from app.api.v1 import voice as voice_routes
    from app.core.deps import get_current_user, get_db
    from app.main import app
    from app.services.gemini_live import GEMINI_LIVE_WEBSOCKET_URL, GeminiEphemeralSession

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
    monkeypatch.setattr(voice_routes, "write_audit", lambda *args, **kwargs: None)

    mock_role = MagicMock()
    mock_role.role.code = "farmer"
    mock_user = MagicMock()
    mock_user.id = uuid4()
    mock_user.roles = [mock_role]

    mock_db = MagicMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        response = client.post(
            "/api/v1/voice/session-token",
            headers={"Authorization": "Bearer mock-farmer-token"},
            json={},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["use_proxy"] is True
        assert body["proxy_path"] == "/api/v1/voice/live"
        assert body["model"] == "gemini-3.1-flash-live-preview"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


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


def test_audit_voice_action_endpoint(client, monkeypatch):
    """Voice action audit logs should be accepted and recorded for authenticated farmers."""
    from unittest.mock import MagicMock
    from uuid import uuid4
    from app.api.v1 import voice as voice_routes
    from app.core.deps import get_current_user, get_db
    from app.main import app

    audited = []
    monkeypatch.setattr(voice_routes, "write_audit", lambda *args, **kwargs: audited.append(kwargs))

    mock_role = MagicMock()
    mock_role.role.code = "farmer"
    mock_user = MagicMock()
    mock_user.id = uuid4()
    mock_user.roles = [mock_role]

    mock_db = MagicMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    session_id = str(uuid4())
    try:
        response = client.post(
            "/api/v1/voice/actions/audit",
            headers={"Authorization": "Bearer mock-farmer-token"},
            json={
                "session_id": session_id,
                "action": "capture_current_angle",
                "outcome": "succeeded",
                "entity_id": "angle_wide_field",
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["recorded"] is True
        assert len(audited) == 1
        assert audited[0]["action"] == "voice_capture_current_angle"
        assert str(audited[0]["entity_id"]) == session_id
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


def test_function_declarations_have_valid_schemas():
    """Verify all tool declarations match valid OpenAPI/JSON Object schema shapes."""
    from app.services.gemini_live import FUNCTION_DECLARATIONS

    expected_tools = {
        "navigate_to_screen",
        "change_language",
        "list_my_farms",
        "list_plots",
        "list_crop_types",
        "list_growth_stages",
        "list_crop_cycles",
        "list_my_submissions",
        "list_notifications",
        "list_evidence_reminders",
        "read_offline_queue",
        "begin_guided_capture",
        "read_capture_guidance",
        "capture_current_angle",
        "set_capture_observation",
        "save_guided_capture_offline",
        "prepare_create_farm",
        "prepare_create_plot",
        "prepare_create_crop_cycle",
        "prepare_update_evidence_reminder",
        "prepare_snooze_evidence_reminder",
        "prepare_mark_notification_read",
        "prepare_logout",
        "prepare_sync_offline_queue",
        "prepare_finalize_submission",
        "confirm_pending_action",
        "cancel_pending_action",
    }

    declared_names = {tool["name"] for tool in FUNCTION_DECLARATIONS}
    missing = expected_tools - declared_names
    assert not missing, f"Missing tool declarations: {missing}"

    for tool in FUNCTION_DECLARATIONS:
        assert "name" in tool and isinstance(tool["name"], str)
        assert "description" in tool and isinstance(tool["description"], str)
        assert "parameters" in tool and isinstance(tool["parameters"], dict)
        params = tool["parameters"]
        assert params.get("type") == "OBJECT"
        assert "properties" in params and isinstance(params["properties"], dict)


def test_authenticate_farmer_ws_rejects_invalid_tokens():
    """_authenticate_farmer_ws should raise HTTP 401 on invalid JWT tokens."""
    from fastapi import HTTPException
    from app.api.v1.voice import _authenticate_farmer_ws

    with pytest.raises(HTTPException) as exc_info:
        _authenticate_farmer_ws("invalid.jwt.token")
    assert exc_info.value.status_code == 401

