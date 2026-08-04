"""Authentication and authorization tests."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "fasalpramaan-api"
    assert "status" in body


def test_root_branding(client: TestClient):
    r = client.get("/")
    assert r.status_code == 200
    assert "FasalPramaan" in r.json()["name"]


def test_login_farmer(client: TestClient, farmer_token: str):
    assert farmer_token
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {farmer_token}"})
    assert r.status_code == 200
    assert "farmer" in r.json()["roles"]


def test_login_invalid(client: TestClient):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "farmer@fasalpramaan.local", "password": "wrong-password"},
    )
    assert r.status_code == 401


def test_farmer_denied_admin(client: TestClient, farmer_token: str):
    r = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {farmer_token}"})
    assert r.status_code == 403


def test_reviewer_can_overview(client: TestClient, reviewer_token: str):
    r = client.get("/api/v1/dashboard/overview", headers={"Authorization": f"Bearer {reviewer_token}"})
    assert r.status_code == 200
    assert "total_submissions" in r.json()


def test_register_and_login(client: TestClient):
    email = "newfarmer_test@fasalpramaan.local"
    # cleanup path: login if exists
    r = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "TestPass123!",
            "full_name": "Test Farmer",
            "role": "farmer",
        },
    )
    # 201 or 400 if already registered
    assert r.status_code in (201, 400)
    r2 = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "TestPass123!"},
    )
    if r.status_code == 201 or r2.status_code == 200:
        assert r2.status_code == 200
        assert "access_token" in r2.json()


def test_logout_revokes_presented_access_token(client: TestClient):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "farmer@fasalpramaan.local", "password": "Demo@12345"},
    )
    assert login.status_code == 200
    tokens = login.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200
    logout = client.post(
        "/api/v1/auth/logout",
        headers=headers,
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert logout.status_code == 200
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_refresh_token_reuse_revokes_rotated_family(client: TestClient):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "farmer@fasalpramaan.local", "password": "Demo@12345"},
    )
    assert login.status_code == 200
    original = login.json()["refresh_token"]
    rotated = client.post("/api/v1/auth/refresh", json={"refresh_token": original})
    assert rotated.status_code == 200
    replacement = rotated.json()["refresh_token"]
    reuse = client.post("/api/v1/auth/refresh", json={"refresh_token": original})
    assert reuse.status_code == 401
    assert "reuse detected" in reuse.text
    assert client.post(
        "/api/v1/auth/refresh", json={"refresh_token": replacement}
    ).status_code == 401


def test_new_registration_is_not_marked_verified(client: TestClient):
    email = f"unverified_{uuid.uuid4().hex}@fasalpramaan.local"
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123!",
            "full_name": "Unverified Farmer",
            "role": "farmer",
        },
    )
    assert response.status_code == 201
    me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {response.json()['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["is_verified"] is False
