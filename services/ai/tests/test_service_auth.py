"""Service-to-service authentication and error-sanitization regressions."""

from fastapi.testclient import TestClient


def test_v1_routes_require_configured_service_token(monkeypatch):
    import app.main as main

    monkeypatch.setattr(main, "_SERVICE_TOKEN", "s" * 40)
    client = TestClient(main.app)
    denied = client.get("/v1/models")
    assert denied.status_code == 401
    allowed = client.get("/v1/models", headers={"X-Service-Token": "s" * 40})
    assert allowed.status_code == 200


def test_inference_errors_do_not_leak_exception_text(monkeypatch):
    import app.main as main

    class BrokenAdapter:
        def analyze(self, _body):
            raise RuntimeError("sensitive-internal-path")

    monkeypatch.setattr(main, "_SERVICE_TOKEN", "")
    monkeypatch.setattr(main, "get_adapter", lambda _name=None: BrokenAdapter())
    response = TestClient(main.app).post(
        "/v1/analyze",
        json={"submission_id": "sanitize-test", "images": []},
    )
    assert response.status_code == 500
    assert response.json()["detail"] == "Inference failed"
    assert "sensitive-internal-path" not in response.text


def test_missing_model_path_is_sanitized(monkeypatch):
    import app.main as main

    monkeypatch.setattr(main, "_SERVICE_TOKEN", "")
    monkeypatch.setattr(
        main,
        "get_adapter",
        lambda _name=None: (_ for _ in ()).throw(FileNotFoundError("C:/private/model.pt")),
    )
    response = TestClient(main.app).post(
        "/v1/analyze",
        json={"submission_id": "missing-model-test", "images": []},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Model unavailable"
    assert "private" not in response.text
