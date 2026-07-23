"""BOLA/IDOR authorization tests — real API path with two farmer accounts."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _register_or_login(client: TestClient, email: str, password: str = "TestPass123!") -> str:
    r = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": f"User {email}",
            "role": "farmer",
        },
    )
    if r.status_code not in (201, 400):
        raise AssertionError(f"register failed: {r.status_code} {r.text}")
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def test_cannot_self_register_privileged_roles(client: TestClient):
    """Staff roles grant cross-farmer access — must not be self-assignable."""
    for role in ("administrator", "reviewer", "admin", "field_officer"):
        r = client.post(
            "/api/v1/auth/register",
            json={
                "email": f"priv_{role}_{uuid.uuid4().hex[:6]}@fasalpramaan.local",
                "password": "TestPass123!",
                "full_name": "Hacker",
                "role": role,
            },
        )
        # Schema 422 or handler 400 — never 201
        assert r.status_code in (400, 422), r.text
        assert r.status_code != 201


def test_field_officer_cannot_self_register_and_access_farms(client: TestClient, farmer_token: str):
    """Regression: FO self-reg was a BOLA bypass via is_staff() cross-farmer access."""
    email = f"fake_fo_{uuid.uuid4().hex[:8]}@fasalpramaan.local"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "TestPass123!",
            "full_name": "Fake Officer",
            "role": "field_officer",
        },
    )
    assert reg.status_code in (400, 422), reg.text

    # Even if someone tries login after failed reg, no FO account exists
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123!"})
    assert login.status_code == 401, login.text

    # Seed farmer's farm remains inaccessible without a real staff account
    headers_a = {"Authorization": f"Bearer {farmer_token}"}
    farms_a = client.get("/api/v1/farms", headers=headers_a)
    assert farms_a.status_code == 200
    items = farms_a.json().get("items") or []
    if not items:
        import pytest

        pytest.skip("Seed farmer has no farms")
    farm_id = items[0]["id"]
    # Unauthenticated / failed FO must not read the farm
    r = client.get(f"/api/v1/farms/{farm_id}")
    assert r.status_code == 401


def test_field_officer_is_scoped_to_assigned_jurisdiction(client: TestClient):
    from app.db.models import Farm, FarmerProfile, Jurisdiction, User
    from app.db.session import SessionLocal

    code = f"OUT-{uuid.uuid4().hex[:10]}"
    with SessionLocal() as db:
        state = db.query(Jurisdiction).filter(Jurisdiction.level == "state").first()
        farmer = (
            db.query(FarmerProfile)
            .join(User, User.id == FarmerProfile.user_id)
            .filter(User.email == "farmer@fasalpramaan.local")
            .one()
        )
        outside = Jurisdiction(
            code=code,
            name="Outside Officer Scope",
            level="village",
            parent_id=state.id,
        )
        db.add(outside)
        db.flush()
        farm = Farm(farmer_id=farmer.id, name="Outside Scope Farm", village_id=outside.id)
        db.add(farm)
        db.commit()
        farm_id = str(farm.id)

    try:
        officer = client.post(
            "/api/v1/auth/login",
            json={"email": "officer@fasalpramaan.local", "password": "Demo@12345"},
        )
        assert officer.status_code == 200
        headers = {"Authorization": f"Bearer {officer.json()['access_token']}"}
        listing = client.get("/api/v1/farms", headers=headers)
        assert listing.status_code == 200
        assert farm_id not in {item["id"] for item in listing.json()["items"]}
        assert client.get(f"/api/v1/farms/{farm_id}", headers=headers).status_code == 403
    finally:
        with SessionLocal() as db:
            db.query(Farm).filter(Farm.id == farm_id).delete(synchronize_session=False)
            db.query(Jurisdiction).filter(Jurisdiction.code == code).delete(synchronize_session=False)
            db.commit()


def test_farmer_cannot_read_other_farm(client: TestClient, farmer_token: str):
    """Farmer B must not access Farmer A's farm by UUID (BOLA)."""
    headers_a = {"Authorization": f"Bearer {farmer_token}"}
    farms_a = client.get("/api/v1/farms", headers=headers_a)
    assert farms_a.status_code == 200
    items = farms_a.json().get("items") or []
    if not items:
        import pytest

        pytest.skip("Seed farmer has no farms")
    farm_id = items[0]["id"]

    token_b = _register_or_login(client, f"authz_b_{uuid.uuid4().hex[:8]}@fasalpramaan.local")
    headers_b = {"Authorization": f"Bearer {token_b}"}

    r = client.get(f"/api/v1/farms/{farm_id}", headers=headers_b)
    assert r.status_code == 403, r.text

    r2 = client.patch(f"/api/v1/farms/{farm_id}", headers=headers_b, json={"name": "Hacked"})
    assert r2.status_code == 403, r2.text

    r3 = client.delete(f"/api/v1/farms/{farm_id}", headers=headers_b)
    assert r3.status_code == 403, r3.text


def test_reviewer_has_read_only_farm_access(client: TestClient, reviewer_token: str):
    """Review authority must not imply authority to alter farmer evidence."""
    headers = {"Authorization": f"Bearer {reviewer_token}"}
    farms = client.get("/api/v1/farms", headers=headers)
    assert farms.status_code == 200, farms.text
    items = farms.json().get("items") or []
    if not items:
        import pytest

        pytest.skip("No farms available")
    farm_id = items[0]["id"]

    assert client.get(f"/api/v1/farms/{farm_id}", headers=headers).status_code == 200
    assert client.patch(
        f"/api/v1/farms/{farm_id}", headers=headers, json={"name": "Reviewer mutation"}
    ).status_code == 403
    assert client.delete(f"/api/v1/farms/{farm_id}", headers=headers).status_code == 403
    assert client.post(
        f"/api/v1/farms/{farm_id}/plots",
        headers=headers,
        json={"name": "Reviewer plot", "area_hectares": 1.0},
    ).status_code == 403

    cycles = client.get("/api/v1/crop-cycles", headers=headers)
    assert cycles.status_code == 200, cycles.text
    if cycles.json():
        existing = cycles.json()[0]
        denied = client.post(
            "/api/v1/crop-cycles",
            headers=headers,
            json={
                "plot_id": existing["plot_id"],
                "crop_type_id": existing["crop_type_id"],
                "season_year": existing["season_year"],
                "season": existing["season"],
            },
        )
        assert denied.status_code == 403, denied.text


def test_farmer_cannot_read_other_submission(client: TestClient, farmer_token: str):
    headers_a = {"Authorization": f"Bearer {farmer_token}"}
    subs = client.get("/api/v1/submissions", headers=headers_a)
    assert subs.status_code == 200
    items = subs.json().get("items") or []
    if not items:
        import pytest

        pytest.skip("No submissions for seed farmer")
    sid = items[0]["id"]

    token_b = _register_or_login(client, f"authz_sub_{uuid.uuid4().hex[:8]}@fasalpramaan.local")
    headers_b = {"Authorization": f"Bearer {token_b}"}
    r = client.get(f"/api/v1/submissions/{sid}", headers=headers_b)
    assert r.status_code == 403, r.text

    r2 = client.post(f"/api/v1/submissions/{sid}/finalize", headers=headers_b, json={})
    assert r2.status_code == 403, r2.text

    r3 = client.post(f"/api/v1/submissions/{sid}/retry-processing", headers=headers_b)
    assert r3.status_code == 403, r3.text

    r4 = client.get(f"/api/v1/events/submissions/{sid}/status", headers=headers_b)
    assert r4.status_code == 403, r4.text


def test_farmer_cannot_use_other_cycle_for_draft(client: TestClient, farmer_token: str):
    headers_a = {"Authorization": f"Bearer {farmer_token}"}
    cycles = client.get("/api/v1/crop-cycles", headers=headers_a)
    assert cycles.status_code == 200
    if not cycles.json():
        import pytest

        pytest.skip("No crop cycles")
    cycle_id = cycles.json()[0]["id"]

    token_b = _register_or_login(client, f"authz_cyc_{uuid.uuid4().hex[:8]}@fasalpramaan.local")
    headers_b = {"Authorization": f"Bearer {token_b}"}
    r = client.post(
        "/api/v1/submissions/drafts",
        headers=headers_b,
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": f"steal-{uuid.uuid4()}",
            "capture_lat": 23.0,
            "capture_lon": 77.0,
            "offline_created": True,
        },
    )
    assert r.status_code == 403, r.text


def test_idempotency_key_not_shared_across_users(client: TestClient, farmer_token: str):
    headers_a = {"Authorization": f"Bearer {farmer_token}"}
    cycles = client.get("/api/v1/crop-cycles", headers=headers_a)
    if not cycles.json():
        import pytest

        pytest.skip("No crop cycles")
    cycle_id = cycles.json()[0]["id"]
    key = f"shared-key-{uuid.uuid4()}"
    r1 = client.post(
        "/api/v1/submissions/drafts",
        headers=headers_a,
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": key,
            "capture_lat": 23.26,
            "capture_lon": 77.41,
            "offline_created": True,
        },
    )
    assert r1.status_code == 201

    token_b = _register_or_login(client, f"authz_idem_{uuid.uuid4().hex[:8]}@fasalpramaan.local")
    # Farmer B has no access to cycle; still must not get A's submission via key
    r2 = client.post(
        "/api/v1/submissions/drafts",
        headers={"Authorization": f"Bearer {token_b}"},
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": key,
            "capture_lat": 23.26,
            "capture_lon": 77.41,
            "offline_created": True,
        },
    )
    assert r2.status_code in (403, 409), r2.text


def test_farmer_list_does_not_include_others(client: TestClient, farmer_token: str):
    token_b = _register_or_login(client, f"authz_list_{uuid.uuid4().hex[:8]}@fasalpramaan.local")
    headers_b = {"Authorization": f"Bearer {token_b}"}
    farms = client.get("/api/v1/farms", headers=headers_b)
    assert farms.status_code == 200
    assert farms.json().get("total", 0) == 0
    assert farms.json().get("items") == []

    subs = client.get("/api/v1/submissions", headers=headers_b)
    assert subs.status_code == 200
    assert subs.json().get("total", 0) == 0


def test_password_recovery_no_enumeration(client: TestClient):
    r = client.post(
        "/api/v1/auth/password-recovery",
        json={"email": f"nobody_{uuid.uuid4().hex[:8]}@example.com"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "nobody_" not in str(body).lower()
    assert "example.com" not in str(body).lower()


def test_unauthenticated_denied(client: TestClient):
    assert client.get("/api/v1/farms").status_code == 401
    assert client.get("/api/v1/submissions").status_code == 401
    assert client.get("/api/v1/auth/me").status_code == 401


def test_farmer_can_read_fo_submission_on_own_farm(client: TestClient, farmer_token: str):
    """FO (staff) draft on farmer's cycle must be visible to the farm owner."""
    import os

    fo_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "officer@fasalpramaan.local",
            "password": os.getenv("DEMO_PASSWORD", "Demo@12345"),
        },
    )
    if fo_login.status_code != 200:
        import pytest

        pytest.skip("Seed field officer not available")
    fo_token = fo_login.json()["access_token"]
    fo_headers = {"Authorization": f"Bearer {fo_token}"}
    farmer_headers = {"Authorization": f"Bearer {farmer_token}"}

    cycles = client.get("/api/v1/crop-cycles", headers=farmer_headers)
    assert cycles.status_code == 200
    if not cycles.json():
        import pytest

        pytest.skip("No crop cycles")
    cycle_id = cycles.json()[0]["id"]

    # FO can access farmer cycle (staff) and create draft
    draft = client.post(
        "/api/v1/submissions/drafts",
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": f"fo-behalf-{uuid.uuid4()}",
            "capture_lat": 23.26,
            "capture_lon": 77.41,
            "offline_created": True,
        },
        headers=fo_headers,
    )
    assert draft.status_code == 201, draft.text
    sid = draft.json()["id"]
    fo_me = client.get("/api/v1/auth/me", headers=fo_headers).json()["id"]
    farmer_me = client.get("/api/v1/auth/me", headers=farmer_headers).json()["id"]
    assert draft.json()["submitted_by"] == fo_me
    assert fo_me != farmer_me

    # Farmer (not submitter) must still read own-farm submission
    r = client.get(f"/api/v1/submissions/{sid}", headers=farmer_headers)
    assert r.status_code == 200, r.text
    assert r.json()["id"] == sid

    listed = client.get("/api/v1/submissions", headers=farmer_headers)
    assert listed.status_code == 200
    ids = {item["id"] for item in listed.json().get("items") or []}
    assert sid in ids

    # Unrelated farmer still denied
    token_b = _register_or_login(client, f"authz_fo_vis_{uuid.uuid4().hex[:8]}@fasalpramaan.local")
    r2 = client.get(
        f"/api/v1/submissions/{sid}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r2.status_code == 403, r2.text


def _farmer_profile_id_for_email(email: str):
    from app.db.models import FarmerProfile, User
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower()).first()
        if not user:
            return None
        profile = db.query(FarmerProfile).filter(FarmerProfile.user_id == user.id).first()
        return str(profile.id) if profile else None
    finally:
        db.close()


def test_fo_on_behalf_must_match_cycle_farm_owner(client: TestClient, farmer_token: str):
    """FO cannot set on_behalf_of_farmer_id to an unrelated farmer on another farm's cycle."""
    import os

    fo_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "officer@fasalpramaan.local",
            "password": os.getenv("DEMO_PASSWORD", "Demo@12345"),
        },
    )
    if fo_login.status_code != 200:
        import pytest

        pytest.skip("Seed field officer not available")
    fo_headers = {"Authorization": f"Bearer {fo_login.json()['access_token']}"}
    farmer_headers = {"Authorization": f"Bearer {farmer_token}"}

    cycles = client.get("/api/v1/crop-cycles", headers=farmer_headers)
    if not cycles.json():
        import pytest

        pytest.skip("No crop cycles")
    cycle_id = cycles.json()[0]["id"]

    # Register unrelated farmer C and resolve their FarmerProfile id
    email_c = f"authz_behalf_c_{uuid.uuid4().hex[:8]}@fasalpramaan.local"
    _register_or_login(client, email_c)
    profile_c = _farmer_profile_id_for_email(email_c)
    assert profile_c, "registered farmer must have FarmerProfile"

    # Wrong on_behalf (C) on farmer A's cycle → 400
    bad = client.post(
        "/api/v1/submissions/drafts",
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": f"bad-behalf-{uuid.uuid4()}",
            "capture_lat": 23.26,
            "capture_lon": 77.41,
            "on_behalf_of_farmer_id": profile_c,
            "offline_created": True,
        },
        headers=fo_headers,
    )
    assert bad.status_code == 400, bad.text
    assert "on_behalf" in bad.text.lower() or "own" in bad.text.lower()

    # Correct on_behalf (farm owner A) is allowed
    profile_a = _farmer_profile_id_for_email("farmer@fasalpramaan.local")
    if not profile_a:
        import pytest

        pytest.skip("Seed farmer profile missing")
    good = client.post(
        "/api/v1/submissions/drafts",
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": f"good-behalf-{uuid.uuid4()}",
            "capture_lat": 23.26,
            "capture_lon": 77.41,
            "on_behalf_of_farmer_id": profile_a,
            "offline_created": True,
        },
        headers=fo_headers,
    )
    assert good.status_code == 201, good.text
    assert good.json().get("on_behalf_of_farmer_id") == profile_a


def test_on_behalf_alone_does_not_grant_read_access(client: TestClient, farmer_token: str):
    """Even if on_behalf_of_farmer_id is mis-set, only farm-cycle ownership grants read."""
    import os
    from app.db.models import Submission
    from app.db.session import SessionLocal

    fo_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "officer@fasalpramaan.local",
            "password": os.getenv("DEMO_PASSWORD", "Demo@12345"),
        },
    )
    if fo_login.status_code != 200:
        import pytest

        pytest.skip("Seed field officer not available")
    fo_headers = {"Authorization": f"Bearer {fo_login.json()['access_token']}"}
    farmer_headers = {"Authorization": f"Bearer {farmer_token}"}

    cycles = client.get("/api/v1/crop-cycles", headers=farmer_headers)
    if not cycles.json():
        import pytest

        pytest.skip("No crop cycles")
    cycle_id = cycles.json()[0]["id"]

    draft = client.post(
        "/api/v1/submissions/drafts",
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": f"misbehalf-{uuid.uuid4()}",
            "capture_lat": 23.26,
            "capture_lon": 77.41,
            "offline_created": True,
        },
        headers=fo_headers,
    )
    assert draft.status_code == 201, draft.text
    sid = draft.json()["id"]

    email_c = f"authz_misbehalf_{uuid.uuid4().hex[:8]}@fasalpramaan.local"
    token_c = _register_or_login(client, email_c)
    profile_c = _farmer_profile_id_for_email(email_c)
    assert profile_c

    # Poison on_behalf to farmer C while cycle still belongs to seed farmer A
    db = SessionLocal()
    try:
        row = db.query(Submission).filter(Submission.id == sid).one()
        from uuid import UUID as _UUID

        row.on_behalf_of_farmer_id = _UUID(profile_c)
        db.commit()
    finally:
        db.close()

    # Farmer C must still be denied — ownership is farm→cycle, not on_behalf alone
    r = client.get(
        f"/api/v1/submissions/{sid}",
        headers={"Authorization": f"Bearer {token_c}"},
    )
    assert r.status_code == 403, r.text

    listed = client.get(
        "/api/v1/submissions",
        headers={"Authorization": f"Bearer {token_c}"},
    )
    assert listed.status_code == 200
    ids = {item["id"] for item in listed.json().get("items") or []}
    assert sid not in ids

    # Real farm owner still has access
    r_owner = client.get(f"/api/v1/submissions/{sid}", headers=farmer_headers)
    assert r_owner.status_code == 200, r_owner.text
