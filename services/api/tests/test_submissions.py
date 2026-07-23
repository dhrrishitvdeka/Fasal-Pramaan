"""Submission lifecycle, MinIO object presence, and idempotency tests."""

from __future__ import annotations

import hashlib
import io
import uuid

import httpx
from fastapi.testclient import TestClient
from PIL import Image

from app.services.storage import object_exists, put_bytes


def _tiny_jpeg(marker: bytes = b"FP") -> bytes:
    # Real decodable image, with unique pixels so SHA-256 does not collide.
    digest = hashlib.sha256(marker + uuid.uuid4().bytes).digest()
    image = Image.new("RGB", (96, 96), tuple(digest[:3]))
    pixels = image.load()
    for index, value in enumerate(digest):
        pixels[index, index] = (value, digest[(index + 1) % len(digest)], digest[(index + 2) % len(digest)])
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=90)
    return output.getvalue()


def test_list_crops(client: TestClient, farmer_token: str):
    r = client.get("/api/v1/crops", headers={"Authorization": f"Bearer {farmer_token}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


def test_list_farms_and_cycles(client: TestClient, farmer_token: str):
    headers = {"Authorization": f"Bearer {farmer_token}"}
    farms = client.get("/api/v1/farms", headers=headers)
    assert farms.status_code == 200
    cycles = client.get("/api/v1/crop-cycles", headers=headers)
    assert cycles.status_code == 200


def test_draft_idempotency(client: TestClient, farmer_token: str):
    headers = {"Authorization": f"Bearer {farmer_token}"}
    cycles = client.get("/api/v1/crop-cycles", headers=headers)
    if cycles.status_code != 200 or not cycles.json():
        import pytest

        pytest.skip("No crop cycles in seed")
    cycle_id = cycles.json()[0]["id"]
    key = f"test-idem-{uuid.uuid4()}"
    body = {
        "crop_cycle_id": cycle_id,
        "idempotency_key": key,
        "capture_lat": 23.2615,
        "capture_lon": 77.4125,
        "capture_accuracy_m": 10,
        "offline_created": True,
    }
    r1 = client.post("/api/v1/submissions/drafts", json=body, headers=headers)
    assert r1.status_code == 201
    r2 = client.post("/api/v1/submissions/drafts", json=body, headers=headers)
    assert r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]


def test_confirm_rejects_missing_object(client: TestClient, farmer_token: str):
    """Ghost images must not be markable as uploaded without MinIO object."""
    headers = {"Authorization": f"Bearer {farmer_token}"}
    cycles = client.get("/api/v1/crop-cycles", headers=headers)
    if not cycles.json():
        import pytest

        pytest.skip("No crop cycles")
    cycle_id = cycles.json()[0]["id"]
    key = f"test-ghost-{uuid.uuid4()}"
    draft = client.post(
        "/api/v1/submissions/drafts",
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": key,
            "capture_lat": 23.2615,
            "capture_lon": 77.4125,
            "capture_accuracy_m": 8,
            "offline_created": True,
        },
        headers=headers,
    )
    assert draft.status_code == 201
    sid = draft.json()["id"]
    sha = hashlib.sha256(f"{key}-wide".encode()).hexdigest()
    urls = client.post(
        f"/api/v1/submissions/{sid}/upload-urls",
        json={
            "images": [
                {
                    "angle_type": "wide_field",
                    "sequence_order": 0,
                    "content_type": "image/jpeg",
                    "byte_size": 300,
                    "sha256": sha,
                    "width": 1280,
                    "height": 720,
                }
            ]
        },
        headers=headers,
    )
    assert urls.status_code == 200
    image_id = urls.json()["uploads"][0]["image_id"]
    object_key = urls.json()["uploads"][0]["object_key"]
    assert object_exists(object_key) is False

    empty = client.post(
        f"/api/v1/submissions/{sid}/images/confirm",
        json=[],
        headers=headers,
    )
    assert empty.status_code == 400

    conf = client.post(
        f"/api/v1/submissions/{sid}/images/confirm",
        json=[{"image_id": image_id}],
        headers=headers,
    )
    assert conf.status_code == 400
    assert object_exists(object_key) is False

    # Finalize must fail — required angles not uploaded
    fin = client.post(f"/api/v1/submissions/{sid}/finalize", json={}, headers=headers)
    assert fin.status_code == 409


def test_upload_urls_put_minio_confirm_finalize(client: TestClient, farmer_token: str):
    """Honest path: real MinIO put_bytes + object_exists before confirm/finalize."""
    headers = {"Authorization": f"Bearer {farmer_token}"}
    cycles = client.get("/api/v1/crop-cycles", headers=headers)
    if not cycles.json():
        import pytest

        pytest.skip("No crop cycles")
    cycle_id = cycles.json()[0]["id"]
    key = f"test-minio-{uuid.uuid4()}"
    draft = client.post(
        "/api/v1/submissions/drafts",
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": key,
            "capture_lat": 23.2615,
            "capture_lon": 77.4125,
            "capture_accuracy_m": 8,
            "offline_created": True,
            "farmer_observations": "offline-originated then synced",
        },
        headers=headers,
    )
    assert draft.status_code == 201
    sid = draft.json()["id"]

    images = []
    for i, angle in enumerate(["wide_field", "mid_canopy", "closeup_damage"]):
        payload = _tiny_jpeg(angle.encode())
        sha = hashlib.sha256(payload).hexdigest()
        images.append(
            {
                "angle_type": angle,
                "sequence_order": i,
                "content_type": "image/jpeg",
                "byte_size": len(payload),
                "sha256": sha,
                "width": 1280,
                "height": 720,
                "_bytes": payload,
            }
        )

    meta_only = [{k: v for k, v in im.items() if k != "_bytes"} for im in images]
    urls = client.post(
        f"/api/v1/submissions/{sid}/upload-urls",
        json={"images": meta_only},
        headers=headers,
    )
    assert urls.status_code == 200
    uploads = urls.json()["uploads"]
    assert len(uploads) == 3
    assert [item["headers"]["Content-Length"] for item in uploads] == [
        str(image["byte_size"]) for image in images
    ]

    repeated = client.post(
        f"/api/v1/submissions/{sid}/upload-urls",
        json={"images": meta_only},
        headers=headers,
    )
    assert repeated.status_code == 200, repeated.text
    assert [item["image_id"] for item in repeated.json()["uploads"]] == [
        item["image_id"] for item in uploads
    ]

    for u, im in zip(uploads, images, strict=True):
        put_bytes(u["object_key"], im["_bytes"], content_type="image/jpeg")
        assert object_exists(u["object_key"]) is True, f"missing object {u['object_key']}"

    confirms = [{"image_id": u["image_id"]} for u in uploads]
    conf = client.post(
        f"/api/v1/submissions/{sid}/images/confirm",
        json=confirms,
        headers=headers,
    )
    assert conf.status_code == 200

    fin = client.post(f"/api/v1/submissions/{sid}/finalize", json={}, headers=headers)
    assert fin.status_code == 200
    assert fin.json()["status"] in (
        "uploaded",
        "processing",
        "pending_review",
        "needs_recapture",
        "physical_inspection",
        "failed",
        "verified",
    )
    fin_again = client.post(f"/api/v1/submissions/{sid}/finalize", json={}, headers=headers)
    assert fin_again.status_code == 200, fin_again.text
    from app.db.models import AIJob
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        assert db.query(AIJob).filter(AIJob.submission_id == sid).count() == 1
    finally:
        db.close()
    # Objects remain after finalize
    for u in uploads:
        assert object_exists(u["object_key"]) is True


def test_confirm_rejects_tampered_object(client: TestClient, farmer_token: str):
    headers = {"Authorization": f"Bearer {farmer_token}"}
    cycles = client.get("/api/v1/crop-cycles", headers=headers).json()
    if not cycles:
        import pytest

        pytest.skip("No crop cycles")
    draft = client.post(
        "/api/v1/submissions/drafts",
        json={
            "crop_cycle_id": cycles[0]["id"],
            "idempotency_key": f"tamper-{uuid.uuid4()}",
            "capture_lat": 23.2615,
            "capture_lon": 77.4125,
        },
        headers=headers,
    )
    sid = draft.json()["id"]
    expected = _tiny_jpeg(b"expected")
    actual = _tiny_jpeg(b"tampered")
    request = client.post(
        f"/api/v1/submissions/{sid}/upload-urls",
        json={
            "images": [
                {
                    "angle_type": "wide_field",
                    "content_type": "image/jpeg",
                    "byte_size": len(expected),
                    "sha256": hashlib.sha256(expected).hexdigest(),
                }
            ]
        },
        headers=headers,
    )
    assert request.status_code == 200, request.text
    upload = request.json()["uploads"][0]
    put_bytes(upload["object_key"], actual)
    confirm = client.post(
        f"/api/v1/submissions/{sid}/images/confirm",
        json=[{"image_id": upload["image_id"]}],
        headers=headers,
    )
    assert confirm.status_code == 400, confirm.text
    assert "mismatch" in confirm.text.lower()


def test_offline_sync_simulation_end_to_end(client: TestClient, farmer_token: str):
    """
    Simulates mobile offline queue sync on the real API+MinIO path:
    offline draft (idempotent) → upload URLs → store bytes → confirm → finalize.
    """
    headers = {"Authorization": f"Bearer {farmer_token}"}
    cycles = client.get("/api/v1/crop-cycles", headers=headers)
    if not cycles.json():
        import pytest

        pytest.skip("No crop cycles")
    cycle_id = cycles.json()[0]["id"]
    local_idem = f"offline-queue-{uuid.uuid4()}"

    # Local device would store this until connectivity returns
    draft_body = {
        "crop_cycle_id": cycle_id,
        "idempotency_key": local_idem,
        "capture_lat": 23.2615,
        "capture_lon": 77.4125,
        "capture_accuracy_m": 9,
        "offline_created": True,
        "device_id": "offline-sim-device",
        "farmer_observations": "queued offline then synced",
    }
    d1 = client.post("/api/v1/submissions/drafts", json=draft_body, headers=headers)
    d2 = client.post("/api/v1/submissions/drafts", json=draft_body, headers=headers)
    assert d1.status_code == 201 and d2.status_code == 201
    assert d1.json()["id"] == d2.json()["id"]
    sid = d1.json()["id"]

    local_files = {
        a: _tiny_jpeg(f"offline-{a}".encode()) for a in ["wide_field", "mid_canopy", "closeup_damage"]
    }
    meta = []
    for i, (angle, blob) in enumerate(local_files.items()):
        meta.append(
            {
                "angle_type": angle,
                "sequence_order": i,
                "content_type": "image/jpeg",
                "byte_size": len(blob),
                "sha256": hashlib.sha256(blob).hexdigest(),
                "width": 1280,
                "height": 720,
            }
        )
    urls = client.post(
        f"/api/v1/submissions/{sid}/upload-urls",
        json={"images": meta},
        headers=headers,
    ).json()["uploads"]

    for u in urls:
        blob = local_files[u["angle_type"]]
        # Prefer direct put_bytes (authoritative storage path); also try presigned when host-reachable
        put_bytes(u["object_key"], blob)
        assert object_exists(u["object_key"]) is True
        try:
            httpx.put(
                u["upload_url"],
                content=blob,
                headers={"Content-Type": "image/jpeg"},
                timeout=10.0,
            )
        except Exception:
            pass  # presigned host may be localhost-only from container

    conf = client.post(
        f"/api/v1/submissions/{sid}/images/confirm",
        json=[{"image_id": u["image_id"]} for u in urls],
        headers=headers,
    )
    assert conf.status_code == 200
    fin = client.post(f"/api/v1/submissions/{sid}/finalize", json={}, headers=headers)
    assert fin.status_code == 200
    for u in urls:
        assert object_exists(u["object_key"]) is True

    sync = client.post(
        "/api/v1/sync/push",
        json={
            "operations": [
                {
                    "client_op_id": str(uuid.uuid4()),
                    "operation_type": "submission_finalize",
                    "payload": {"id": sid, "local_id": local_idem},
                }
            ]
        },
        headers=headers,
    )
    assert sync.status_code == 200


def test_reviewer_map_and_record_complete_assessment(client: TestClient, reviewer_token: str):
    headers = {"Authorization": f"Bearer {reviewer_token}"}
    markers = client.get("/api/v1/dashboard/map/markers", headers=headers)
    assert markers.status_code == 200
    queue = client.get("/api/v1/review/queue", headers=headers)
    assert queue.status_code == 200
    items = queue.json().get("items") or []
    if not items:
        import pytest

        pytest.skip("No pending reviews")
    sid = items[0]["id"]
    action = client.post(
        f"/api/v1/review/{sid}/action",
        json={
            "action": "correct",
            "override_reason": "AI result lacks the required assessment fields",
            "corrected_damage_codes": ["other"],
            "corrected_severity": "low",
            "corrected_affected_area_pct": 10,
            "notes": "Completed from the available evidence",
        },
        headers=headers,
    )
    assert action.status_code == 200
    assert action.json()["status"] == "verified"


def test_override_requires_reason(client: TestClient, reviewer_token: str):
    headers = {"Authorization": f"Bearer {reviewer_token}"}
    queue = client.get("/api/v1/review/queue?status=pending_review", headers=headers)
    items = queue.json().get("items") or []
    if not items:
        import pytest

        pytest.skip("No pending reviews for override test")
    sid = items[0]["id"]
    bad = client.post(
        f"/api/v1/review/{sid}/action",
        json={"action": "correct", "corrected_severity": "low"},
        headers=headers,
    )
    assert bad.status_code == 400
    good = client.post(
        f"/api/v1/review/{sid}/action",
        json={
            "action": "correct",
            "corrected_severity": "low",
            "corrected_damage_codes": ["disease"],
            "corrected_affected_area_pct": 12.5,
            "override_reason": "Field notes indicate lower severity than AI",
        },
        headers=headers,
    )
    assert good.status_code == 200


def test_rules_engine_unit():
    from app.services.rules import decide_review_path

    status, rec = decide_review_path(
        {"overall_confidence": 0.9, "severity": "none", "quality_warnings": []}
    )
    assert status == "pending_review"
    status2, rec2 = decide_review_path(
        {"overall_confidence": 0.9, "severity": "none", "quality_warnings": ["excessive_blur"]}
    )
    assert status2 == "needs_recapture"


def test_finalize_requires_geo_coordinates(client: TestClient, farmer_token: str):
    """PDF geo-tagged evidence: finalize without lat/lon must fail."""
    headers = {"Authorization": f"Bearer {farmer_token}"}
    cycles = client.get("/api/v1/crop-cycles", headers=headers)
    if not cycles.json():
        import pytest

        pytest.skip("No crop cycles")
    cycle_id = cycles.json()[0]["id"]
    draft = client.post(
        "/api/v1/submissions/drafts",
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": f"no-gps-{uuid.uuid4()}",
            "offline_created": True,
            # intentionally omit capture_lat/lon
        },
        headers=headers,
    )
    assert draft.status_code == 201
    sid = draft.json()["id"]
    assert draft.json().get("anomaly_flags", {}).get("missing_gps") is True

    # Even with all angles uploaded, finalize must refuse missing GPS
    images = []
    blobs: dict[str, bytes] = {}
    for i, angle in enumerate(["wide_field", "mid_canopy", "closeup_damage"]):
        payload = _tiny_jpeg(angle.encode())
        blobs[angle] = payload
        images.append(
            {
                "angle_type": angle,
                "sequence_order": i,
                "content_type": "image/jpeg",
                "byte_size": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "width": 64,
                "height": 64,
            }
        )
    urls = client.post(
        f"/api/v1/submissions/{sid}/upload-urls",
        json={"images": images},
        headers=headers,
    )
    assert urls.status_code == 200
    for u in urls.json()["uploads"]:
        put_bytes(u["object_key"], blobs[u["angle_type"]])
    conf = client.post(
        f"/api/v1/submissions/{sid}/images/confirm",
        json=[{"image_id": u["image_id"]} for u in urls.json()["uploads"]],
        headers=headers,
    )
    assert conf.status_code == 200
    fin = client.post(f"/api/v1/submissions/{sid}/finalize", json={}, headers=headers)
    assert fin.status_code == 400, fin.text
    assert "geo" in fin.text.lower() or "capture_lat" in fin.text.lower()


def test_draft_defaults_growth_stage_from_cycle(client: TestClient, farmer_token: str):
    """PDF growth-stage capture: omit growth_stage_id → inherit from crop cycle."""
    headers = {"Authorization": f"Bearer {farmer_token}"}
    cycles = client.get("/api/v1/crop-cycles", headers=headers)
    if not cycles.json():
        import pytest

        pytest.skip("No crop cycles")
    cycle = cycles.json()[0]
    cycle_id = cycle["id"]
    expected_stage = cycle.get("current_growth_stage_id")
    draft = client.post(
        "/api/v1/submissions/drafts",
        json={
            "crop_cycle_id": cycle_id,
            "idempotency_key": f"stage-default-{uuid.uuid4()}",
            "capture_lat": 23.26,
            "capture_lon": 77.41,
            "offline_created": True,
        },
        headers=headers,
    )
    assert draft.status_code == 201, draft.text
    assert draft.json()["crop_cycle_id"] == cycle_id
    if expected_stage:
        assert draft.json().get("growth_stage_id") == expected_stage
