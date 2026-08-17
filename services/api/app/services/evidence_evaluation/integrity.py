"""Evidence Integrity evaluation module.

Evaluates evidence trustworthiness and authenticity:
- SHA-256 integrity & checksum validation
- Perceptual duplicate detection across distinct capture angles
- Immutable original status (is_original_immutable == True)
- Metadata intactness (dimensions, device info, EXIF)
- Server-side verification (upload verification & image decoding)
- Client/server check consistency
- Mock GPS / fake location detection
- Suspicious reused files (e.g. duplicate SHA-256 across angles)
- Tamper indicators

Integrity is not image quality: a perfectly sharp image with failed authenticity
remains an integrity failure.

Output normalized to [0, 100].
"""

from __future__ import annotations

import re
from typing import Any

from app.services.evidence_evaluation.quality import _extract_val

HEX_SHA256_REGEX = re.compile(r"^[a-fA-F0-9]{64}$")


def evaluate_evidence_integrity(
    images: list[dict[str, Any] | Any],
    submission_data: dict[str, Any] | Any | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """Evaluate Evidence Integrity score and authenticity indicators.

    Returns:
        dict containing:
        - score: int [0, 100]
        - available: bool
        - sha256_valid: bool
        - perceptual_duplicates_detected: bool
        - immutable_original: bool
        - metadata_intact: bool
        - server_verified: bool
        - client_server_consistent: bool
        - mock_gps_detected: bool
        - tamper_indicators: list[str]
        - warnings: list[str]
        - details: dict
    """
    if not images:
        return {
            "score": 0,
            "available": False,
            "reason": "no_images_provided",
            "sha256_valid": False,
            "perceptual_duplicates_detected": False,
            "immutable_original": False,
            "metadata_intact": False,
            "server_verified": False,
            "client_server_consistent": False,
            "mock_gps_detected": False,
            "tamper_indicators": ["no_evidence_images"],
            "warnings": ["No images provided for integrity evaluation"],
            "details": {},
        }

    tamper_indicators: list[str] = []
    warnings: list[str] = []

    sha256_valid = True
    perceptual_duplicates_detected = False
    immutable_original = True
    metadata_intact = True
    server_verified = True
    client_server_consistent = True
    mock_gps_detected = False

    seen_sha256: dict[str, str] = {}  # sha256 -> angle_type
    seen_phash: dict[str, str] = {}  # phash -> angle_type

    for idx, img in enumerate(images):
        angle = _extract_val(img, "angle_type", f"image_{idx}")
        sha = _extract_val(img, "sha256")
        phash = _extract_val(img, "perceptual_hash")
        is_immutable = _extract_val(img, "is_original_immutable", True)
        upload_status = _extract_val(img, "upload_status", "uploaded")
        client_checks = _extract_val(img, "client_checks") or {}
        server_checks = _extract_val(img, "server_checks") or {}
        quality_flags = _extract_val(img, "quality_flags") or {}

        if isinstance(client_checks, dict):
            cc = client_checks
        else:
            cc = {}
        if isinstance(server_checks, dict):
            sc = server_checks
        else:
            sc = {}
        if isinstance(quality_flags, dict):
            qf = quality_flags
        elif isinstance(quality_flags, list):
            qf = {str(k): True for k in quality_flags}
        else:
            qf = {}

        # 1. SHA-256 Hash Validation
        if sha:
            sha_str = str(sha).strip()
            if not HEX_SHA256_REGEX.match(sha_str):
                sha256_valid = False
                tamper_indicators.append(f"invalid_sha256_format:{angle}")
                warnings.append(f"{angle}: Invalid SHA-256 hash format")
            elif sha_str in seen_sha256:
                # Same exact file reused for two different angles!
                sha256_valid = False
                tamper_indicators.append(f"duplicate_sha256_reused:{angle}:{seen_sha256[sha_str]}")
                warnings.append(f"{angle}: Reused exact file from {seen_sha256[sha_str]} (duplicate SHA-256)")
            else:
                seen_sha256[sha_str] = angle
        else:
            sha256_valid = False
            tamper_indicators.append(f"missing_sha256:{angle}")
            warnings.append(f"{angle}: SHA-256 hash is missing")

        # 2. Perceptual Duplicates Check Across Distinct Angles
        if phash:
            phash_str = str(phash).strip()
            if phash_str in seen_phash and seen_phash[phash_str] != angle:
                perceptual_duplicates_detected = True
                tamper_indicators.append(f"perceptual_duplicate:{angle}:{seen_phash[phash_str]}")
                warnings.append(
                    f"{angle}: Perceptually identical to {seen_phash[phash_str]} (duplicate visual content across different angles)"
                )
            else:
                seen_phash[phash_str] = angle

        # 3. Immutable Original Status
        if not is_immutable:
            immutable_original = False
            tamper_indicators.append(f"immutable_original_violation:{angle}")
            warnings.append(f"{angle}: Original image marked as modified or mutable")

        # 4. Server Verification
        if upload_status == "failed" or sc.get("verified") is False or sc.get("decode_failed") is True:
            server_verified = False
            tamper_indicators.append(f"server_verification_failed:{angle}")
            warnings.append(f"{angle}: Server-side verification or decoding failed")

        # 5. Mock GPS / Fake Location Detection
        if (
            cc.get("mock_location") is True
            or qf.get("mock_location") is True
            or sc.get("mock_location") is True
            or _extract_val(img, "mock_location") is True
        ):
            mock_gps_detected = True
            tamper_indicators.append(f"mock_gps_detected:{angle}")
            warnings.append(f"{angle}: Mock/fake GPS provider detected")

        # 6. Metadata Intactness & Client/Server Consistency
        if qf.get("metadata_stripped") or cc.get("metadata_stripped") or sc.get("metadata_corrupt"):
            metadata_intact = False
            tamper_indicators.append(f"metadata_stripped:{angle}")
            warnings.append(f"{angle}: Image metadata / EXIF was stripped or corrupted")

        c_w = cc.get("width")
        s_w = sc.get("width")
        if c_w is not None and s_w is not None and int(c_w) != int(s_w):
            client_server_consistent = False
            tamper_indicators.append(f"client_server_dimension_mismatch:{angle}")
            warnings.append(f"{angle}: Client/server image dimension mismatch ({c_w} vs {s_w})")

    # Check submission-level mock GPS if present
    if submission_data:
        sub_flags = _extract_val(submission_data, "anomaly_flags") or {}
        if isinstance(sub_flags, dict) and sub_flags.get("mock_location"):
            mock_gps_detected = True
            tamper_indicators.append("mock_gps_detected:submission")
            warnings.append("Submission flagged for mock GPS location")

    # Score Calculation (0-100)
    score = 100

    if mock_gps_detected:
        score -= 50
    if not sha256_valid:
        score -= 40
    if perceptual_duplicates_detected:
        score -= 40
    if not immutable_original:
        score -= 50
    if not server_verified:
        score -= 40
    if not client_server_consistent:
        score -= 30
    if not metadata_intact:
        score -= 15

    clamped_score = round(max(0.0, min(100.0, float(score))))

    return {
        "score": clamped_score,
        "available": True,
        "sha256_valid": sha256_valid,
        "perceptual_duplicates_detected": perceptual_duplicates_detected,
        "immutable_original": immutable_original,
        "metadata_intact": metadata_intact,
        "server_verified": server_verified,
        "client_server_consistent": client_server_consistent,
        "mock_gps_detected": mock_gps_detected,
        "tamper_indicators": tamper_indicators,
        "warnings": warnings,
        "details": {
            "tamper_count": len(tamper_indicators),
            "examined_images": len(images),
        },
    }
