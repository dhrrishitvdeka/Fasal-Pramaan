"""Pure backend Evidence Evaluation domain unit test suite for Fasal-Pramaan.

Covers all requirements from readmeforgemini.pdf:
- Evidence Quality (blur, exposure, resolution, visual usefulness, consistency)
- Evidence Coverage (all 5 angles, 1 missing, multiple missing, unusable image, duplicate views, closeup missing, context missing)
- Context (valid GPS, weak GPS, missing GPS, wrong plot, missing timestamp, weather unavailable)
- Integrity (checksum mismatch, duplicate, perceptual duplicate, tamper failure, mock GPS)
- Final Confidence formula & boundaries (0, 39, 40, 49, 50, 84, 85, 100)
- Uncertainty priority ordering (Integrity > Coverage > Visual > Context)
- Specific Evidence Requests (missing close-up, poor wide context, blur, missing GPS)
- Re-evaluation and delta calculation
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.evidence_evaluation import (
    DEFAULT_CONFIDENCE_THRESHOLD,
    EVALUATION_VERSION,
    EVIDENCE_QUALITY_RETAKE_THRESHOLD,
    REQUIRED_ANGLES,
    WEIGHT_CONTEXT,
    WEIGHT_COVERAGE,
    WEIGHT_INTEGRITY,
    WEIGHT_QUALITY,
    calculate_final_evidence_confidence,
    classify_uncertainty,
    evaluate_evidence_context,
    evaluate_evidence_coverage,
    evaluate_evidence_integrity,
    evaluate_evidence_quality,
    evaluate_submission_evidence,
    generate_evidence_request,
    reevaluate_submission_evidence,
)
from app.services.evidence_evaluation.reevaluation import merge_recapture_evidence

# ===========================================================================
# 1. QUALITY EVALUATION TESTS
# ===========================================================================

class TestEvidenceQuality:
    """Test suite for Evidence Quality scoring (blur, exposure, resolution, visual usefulness, consistency)."""

    def test_empty_images_returns_zero_score_unavailable(self):
        result = evaluate_evidence_quality([])
        assert result["score"] == 0
        assert result["available"] is False
        assert result["reason"] == "no_images_provided"
        assert result["components"]["blur"] is None

    def test_high_quality_all_angles(self):
        images = [
            {
                "angle_type": angle,
                "blur_score": 95.0,
                "brightness_score": 60.0,
                "width": 1920,
                "height": 1080,
                "crop_visibility_score": 90.0,
                "damage_visibility_score": 85.0,
                "framing_score": 90.0,
            }
            for angle in REQUIRED_ANGLES
        ]
        result = evaluate_evidence_quality(images)
        assert result["available"] is True
        assert result["score"] >= 85
        assert result["components"]["blur"] >= 90
        assert result["components"]["brightness"] >= 80
        assert result["components"]["resolution"] >= 90
        assert len(result["warnings"]) == 0

    def test_blur_detection_drops_quality_score_below_retake_threshold(self):
        """Hard Rule: IF quality < 40 -> retake image (visual uncertainty)."""
        blurry_images = [
            {
                "angle_type": "mid_canopy",
                "blur_score": 15.0,  # Severely blurry
                "brightness_score": 55.0,
                "width": 1920,
                "height": 1080,
                "quality_flags": {"blur": True},
            }
        ]
        result = evaluate_evidence_quality(blurry_images)
        assert result["components"]["blur"] <= 30
        assert result["score"] < EVIDENCE_QUALITY_RETAKE_THRESHOLD  # Score < 40
        assert any("blurry" in w.lower() for w in result["warnings"])

    def test_exposure_underexposed_and_overexposed(self):
        underexposed = [
            {"angle_type": "left_context", "brightness_score": 10.0, "quality_flags": {"underexposed": True}}
        ]
        res_under = evaluate_evidence_quality(underexposed)
        assert res_under["components"]["brightness"] <= 30
        assert any("underexposed" in w.lower() for w in res_under["warnings"])

        overexposed = [
            {"angle_type": "right_context", "brightness_score": 95.0, "quality_flags": {"overexposed": True}}
        ]
        res_over = evaluate_evidence_quality(overexposed)
        assert res_over["components"]["brightness"] <= 35
        assert any("overexposed" in w.lower() for w in res_over["warnings"])

    def test_low_resolution_penalty(self):
        low_res = [
            {"angle_type": "wide_field", "width": 320, "height": 240, "quality_flags": {"low_resolution": True}}
        ]
        result = evaluate_evidence_quality(low_res)
        assert result["components"]["resolution"] <= 35
        assert any("resolution" in w.lower() for w in result["warnings"])

    def test_visual_usefulness_framing_and_crop_visibility(self):
        bad_framing = [
            {
                "angle_type": "closeup_damage",
                "quality_flags": {"crop_not_visible": True, "suspicious_aspect_ratio": True},
            }
        ]
        result = evaluate_evidence_quality(bad_framing)
        assert result["components"]["crop_visibility"] <= 25
        assert result["components"]["framing"] <= 40

    def test_damage_visibility_evaluation(self):
        poor_damage_vis = [
            {
                "angle_type": "closeup_damage",
                "quality_flags": {"damage_not_visible": True},
            }
        ]
        result = evaluate_evidence_quality(poor_damage_vis)
        assert result["components"]["damage_visibility"] <= 30
        assert any("damage" in w.lower() for w in result["warnings"])

    def test_consistency_across_images(self):
        inconsistent_images = [
            {"angle_type": "wide_field", "blur_score": 95.0, "width": 3840, "height": 2160, "brightness_score": 60.0},
            {"angle_type": "closeup_damage", "blur_score": 10.0, "width": 320, "height": 240, "brightness_score": 10.0},
        ]
        result = evaluate_evidence_quality(inconsistent_images)
        assert result["components"]["consistency"] < 80


# ===========================================================================
# 2. COVERAGE EVALUATION TESTS
# ===========================================================================

class TestEvidenceCoverage:
    """Test suite for Evidence Coverage across the 5 canonical angles."""

    def test_all_five_angles_usable_yields_full_score(self):
        images = [
            {"angle_type": angle, "upload_status": "uploaded", "blur_score": 85.0}
            for angle in REQUIRED_ANGLES
        ]
        result = evaluate_evidence_coverage(images)
        assert result["score"] == 100
        assert result["usable_views"] == 5
        assert len(result["missing_views"]) == 0
        assert result["wide_context_available"] is True
        assert result["closeup_available"] is True

    def test_one_missing_angle(self):
        four_angles = ["wide_field", "left_context", "mid_canopy", "right_context"]
        images = [{"angle_type": a, "upload_status": "uploaded", "blur_score": 85.0} for a in four_angles]
        result = evaluate_evidence_coverage(images)
        assert result["score"] == 80  # 4/5 * 100
        assert result["usable_views"] == 4
        assert result["missing_views"] == ["closeup_damage"]
        assert result["closeup_available"] is False
        assert result["wide_context_available"] is True

    def test_multiple_missing_angles(self):
        two_angles = ["left_context", "mid_canopy"]
        images = [{"angle_type": a, "upload_status": "uploaded", "blur_score": 85.0} for a in two_angles]
        result = evaluate_evidence_coverage(images)
        assert result["score"] == 40  # 2/5 * 100 < 50
        assert result["usable_views"] == 2
        assert set(result["missing_views"]) == {"wide_field", "right_context", "closeup_damage"}
        assert result["wide_context_available"] is False
        assert result["closeup_available"] is False

    def test_present_but_unusable_image_does_not_count_towards_coverage(self):
        """CRITICAL REQUIREMENT: A present-but-unusable image must not count as full coverage."""
        images = [
            {"angle_type": "wide_field", "blur_score": 85.0},
            {"angle_type": "left_context", "blur_score": 85.0},
            {"angle_type": "mid_canopy", "blur_score": 85.0},
            {"angle_type": "right_context", "blur_score": 85.0},
            {"angle_type": "closeup_damage", "blur_score": 10.0, "quality_flags": {"blur": True}},  # Present but unusable
        ]
        result = evaluate_evidence_coverage(images)
        assert result["usable_views"] == 4
        assert result["score"] == 80  # Not 100!
        assert "closeup_damage" in result["missing_views"]
        assert result["closeup_available"] is False
        assert any("closeup_damage: Image is present but unusable" in w for w in result["warnings"])

    def test_duplicate_views_do_not_inflate_coverage(self):
        images = [
            {"angle_type": "wide_field", "blur_score": 85.0},
            {"angle_type": "wide_field", "blur_score": 85.0},  # Duplicate
            {"angle_type": "left_context", "blur_score": 85.0},
            {"angle_type": "mid_canopy", "blur_score": 85.0},
            {"angle_type": "right_context", "blur_score": 85.0},
        ]
        result = evaluate_evidence_coverage(images)
        assert result["usable_views"] == 4
        assert result["score"] == 80
        assert "closeup_damage" in result["missing_views"]
        assert "wide_field" in result["duplicate_views"]

    def test_closeup_missing_specifically(self):
        images = [{"angle_type": a, "blur_score": 85.0} for a in ["wide_field", "left_context", "mid_canopy", "right_context"]]
        result = evaluate_evidence_coverage(images)
        assert result["closeup_available"] is False
        assert "closeup_damage" in result["missing_views"]

    def test_context_missing_specifically(self):
        images = [{"angle_type": a, "blur_score": 85.0} for a in ["mid_canopy", "closeup_damage"]]
        result = evaluate_evidence_coverage(images)
        assert result["wide_context_available"] is False
        assert "wide_field" in result["missing_views"]

    def test_empty_images_zero_coverage(self):
        result = evaluate_evidence_coverage([])
        assert result["score"] == 0
        assert result["usable_views"] == 0
        assert len(result["missing_views"]) == 5


# ===========================================================================
# 3. CONTEXT EVALUATION TESTS
# ===========================================================================

class TestEvidenceContext:
    """Test suite for Evidence Context score and metadata signals."""

    def test_valid_context_complete(self):
        sub_data = {
            "capture_lat": 26.8467,
            "capture_lon": 80.9462,
            "capture_accuracy_m": 8.5,
            "plot_distance_meters": 15.0,
            "capture_timestamp": datetime.now(timezone.utc),
            "crop_cycle_id": "c1234567-1111-2222-3333-444455556666",
            "crop_type": "Wheat",
            "growth_stage": "vegetative",
        }
        result = evaluate_evidence_context(sub_data)
        assert result["available"] is True
        assert result["score"] >= 90
        assert result["gps_valid"] is True
        assert result["gps_accuracy_valid"] is True
        assert result["plot_match"] is True
        assert result["capture_time_available"] is True
        assert result["crop_context_available"] is True

    def test_missing_gps_drops_score_significantly(self):
        """Hard Rule: IF GPS missing -> context uncertainty."""
        sub_data = {
            "capture_lat": None,
            "capture_lon": None,
            "capture_timestamp": datetime.now(timezone.utc),
            "crop_cycle_id": "c1234567",
        }
        result = evaluate_evidence_context(sub_data)
        assert result["gps_valid"] is False
        assert result["gps_accuracy_valid"] is False
        assert result["plot_match"] is False
        assert result["score"] <= 35
        assert any("GPS capture location is missing" in w for w in result["warnings"])

    def test_weak_gps_accuracy_beyond_limit(self):
        sub_data = {
            "capture_lat": 26.8467,
            "capture_lon": 80.9462,
            "capture_accuracy_m": 120.0,  # Exceeds 50m limit
            "capture_timestamp": datetime.now(timezone.utc),
            "crop_cycle_id": "c1234567",
        }
        result = evaluate_evidence_context(sub_data)
        assert result["gps_valid"] is True
        assert result["gps_accuracy_valid"] is False
        assert any("accuracy" in w.lower() for w in result["warnings"])

    def test_wrong_plot_proximity_mismatch(self):
        sub_data = {
            "capture_lat": 26.8467,
            "capture_lon": 80.9462,
            "capture_accuracy_m": 10.0,
            "plot_distance_meters": 450.0,  # Exceeds 200m limit
            "capture_timestamp": datetime.now(timezone.utc),
            "crop_cycle_id": "c1234567",
        }
        result = evaluate_evidence_context(sub_data)
        assert result["gps_valid"] is True
        assert result["plot_match"] is False
        assert any("plot" in w.lower() for w in result["warnings"])

    def test_missing_timestamp_penalty(self):
        sub_data = {
            "capture_lat": 26.8467,
            "capture_lon": 80.9462,
            "capture_accuracy_m": 10.0,
            "capture_timestamp": None,
            "crop_cycle_id": "c1234567",
        }
        result = evaluate_evidence_context(sub_data)
        assert result["capture_time_available"] is False
        assert any("timestamp" in w.lower() for w in result["warnings"])

    def test_weather_unavailable_policy(self):
        """CRITICAL: If weather is unavailable, set available=false, score=null, reason='weather_source_not_configured'.
        NEVER treat missing weather as passed/100.
        """
        sub_data = {
            "capture_lat": 26.8467,
            "capture_lon": 80.9462,
            "capture_accuracy_m": 10.0,
            "capture_timestamp": datetime.now(timezone.utc),
            "crop_cycle_id": "c1234567",
        }
        result = evaluate_evidence_context(sub_data, weather_data=None)
        assert result["weather"]["available"] is False
        assert result["weather"]["score"] is None
        assert result["weather"]["reason"] == "weather_source_not_configured"

    def test_weather_available_when_configured(self):
        sub_data = {
            "capture_lat": 26.8467,
            "capture_lon": 80.9462,
            "capture_accuracy_m": 10.0,
            "capture_timestamp": datetime.now(timezone.utc),
            "crop_cycle_id": "c1234567",
        }
        weather_payload = {
            "available": True,
            "score": 90,
            "reason": "weather_verified",
            "data": {"temp_c": 28.5, "humidity": 65},
        }
        result = evaluate_evidence_context(sub_data, weather_data=weather_payload)
        assert result["weather"]["available"] is True
        assert result["weather"]["score"] == 90
        assert result["weather"]["reason"] == "weather_verified"


# ===========================================================================
# 4. INTEGRITY EVALUATION TESTS
# ===========================================================================

class TestEvidenceIntegrity:
    """Test suite for Evidence Integrity, checksums, duplicate detection, and tamper indicators."""

    def test_clean_evidence_integrity_score_100(self):
        images = [
            {
                "angle_type": angle,
                "sha256": f"a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef{idx}",
                "perceptual_hash": f"112233445566778{idx}",
                "is_original_immutable": True,
                "upload_status": "uploaded",
                "client_checks": {"mock_location": False, "width": 1920},
                "server_checks": {"verified": True, "width": 1920},
                "width": 1920,
                "height": 1080,
            }
            for idx, angle in enumerate(REQUIRED_ANGLES)
        ]
        result = evaluate_evidence_integrity(images)
        assert result["score"] == 100
        assert result["available"] is True
        assert result["sha256_valid"] is True
        assert result["perceptual_duplicates_detected"] is False
        assert result["immutable_original"] is True
        assert result["mock_gps_detected"] is False
        assert len(result["tamper_indicators"]) == 0

    def test_sha256_checksum_mismatch_or_invalid_format(self):
        images = [
            {
                "angle_type": "wide_field",
                "sha256": "invalid_short_hash",
                "is_original_immutable": True,
            }
        ]
        result = evaluate_evidence_integrity(images)
        assert result["sha256_valid"] is False
        assert result["score"] < 100
        assert any("invalid_sha256_format:wide_field" in t for t in result["tamper_indicators"])

    def test_duplicate_file_reused_across_angles(self):
        same_sha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        images = [
            {"angle_type": "wide_field", "sha256": same_sha, "perceptual_hash": "aaa"},
            {"angle_type": "left_context", "sha256": same_sha, "perceptual_hash": "aaa"},
        ]
        result = evaluate_evidence_integrity(images)
        assert result["sha256_valid"] is False
        assert result["score"] <= 60
        assert any("duplicate_sha256_reused" in t for t in result["tamper_indicators"])

    def test_perceptual_duplicate_across_angles(self):
        images = [
            {
                "angle_type": "wide_field",
                "sha256": "1111111111111111111111111111111111111111111111111111111111111111",
                "perceptual_hash": "d4f8e2a1b9c37711",
            },
            {
                "angle_type": "closeup_damage",
                "sha256": "2222222222222222222222222222222222222222222222222222222222222222",
                "perceptual_hash": "d4f8e2a1b9c37711",  # Same perceptual hash!
            },
        ]
        result = evaluate_evidence_integrity(images)
        assert result["perceptual_duplicates_detected"] is True
        assert result["score"] < 100
        assert any("perceptual_duplicate" in t for t in result["tamper_indicators"])

    def test_mock_gps_detected_triggers_integrity_failure(self):
        images = [
            {
                "angle_type": "mid_canopy",
                "sha256": "3333333333333333333333333333333333333333333333333333333333333333",
                "client_checks": {"mock_location": True},
            }
        ]
        result = evaluate_evidence_integrity(images)
        assert result["mock_gps_detected"] is True
        assert result["score"] <= 50
        assert any("mock_gps_detected" in t for t in result["tamper_indicators"])

    def test_immutable_original_violation(self):
        images = [
            {
                "angle_type": "right_context",
                "sha256": "4444444444444444444444444444444444444444444444444444444444444444",
                "is_original_immutable": False,
            }
        ]
        result = evaluate_evidence_integrity(images)
        assert result["immutable_original"] is False
        assert result["score"] <= 50
        assert any("immutable_original_violation" in t for t in result["tamper_indicators"])

    def test_client_server_dimension_mismatch(self):
        images = [
            {
                "angle_type": "wide_field",
                "sha256": "5555555555555555555555555555555555555555555555555555555555555555",
                "client_checks": {"width": 4000},
                "server_checks": {"width": 200},  # Discrepancy
            }
        ]
        result = evaluate_evidence_integrity(images)
        assert result["client_server_consistent"] is False
        assert result["score"] <= 70
        assert any("client_server_dimension_mismatch" in t for t in result["tamper_indicators"])


# ===========================================================================
# 5. CONFIDENCE FORMULA & BOUNDARY TESTS
# ===========================================================================

class TestConfidenceFormulaAndBoundaries:
    """Test suite for final confidence calculation and exact mathematical boundaries."""

    def test_weights_sum_to_one(self):
        assert pytest.approx(WEIGHT_QUALITY + WEIGHT_COVERAGE + WEIGHT_CONTEXT + WEIGHT_INTEGRITY) == 1.0
        assert WEIGHT_QUALITY == 0.4
        assert WEIGHT_COVERAGE == 0.3
        assert WEIGHT_CONTEXT == 0.2
        assert WEIGHT_INTEGRITY == 0.1

    def test_exact_formula_calculation(self):
        # 0.4 * 71 + 0.3 * 55 + 0.2 * 68 + 0.1 * 100 = 28.4 + 16.5 + 13.6 + 10.0 = 68.5 -> round to 68 or 69
        res = calculate_final_evidence_confidence(
            quality_score=71, coverage_score=55, context_score=68, integrity_score=100
        )
        assert res["final"] in (68, 69)
        assert res["quality"] == 71
        assert res["coverage"] == 55
        assert res["context"] == 68
        assert res["integrity"] == 100
        assert res["threshold"] == DEFAULT_CONFIDENCE_THRESHOLD
        assert res["meets_threshold"] is False

    @pytest.mark.parametrize(
        "q, cov, ctx, integ, expected_final, meets",
        [
            (0, 0, 0, 0, 0, False),
            (100, 100, 100, 100, 100, True),
            (39, 100, 100, 100, 76, False),  # quality 39
            (40, 100, 100, 100, 76, False),  # quality 40 boundary
            (50, 100, 100, 100, 80, False),  # quality 50
            (100, 49, 100, 100, 85, True),   # 0.4*100 + 0.3*49 + 0.2*100 + 0.1*100 = 40 + 14.7 + 20 + 10 = 84.7 -> 85
            (100, 50, 100, 100, 85, True),   # 0.4*100 + 0.3*50 + 0.2*100 + 0.1*100 = 40 + 15 + 20 + 10 = 85
            (90, 80, 80, 100, 86, True),     # 36 + 24 + 16 + 10 = 86
            (80, 80, 80, 100, 82, False),    # 32 + 24 + 16 + 10 = 82 (< 85)
        ],
    )
    def test_boundary_scores(self, q, cov, ctx, integ, expected_final, meets):
        res = calculate_final_evidence_confidence(q, cov, ctx, integ)
        assert res["final"] == expected_final
        assert res["meets_threshold"] == meets

    def test_threshold_boundary_84_vs_85(self):
        res_84 = calculate_final_evidence_confidence(80, 80, 90, 100, threshold=85)
        assert res_84["final"] == 84
        assert res_84["meets_threshold"] is False

        res_85 = calculate_final_evidence_confidence(85, 85, 85, 85, threshold=85)
        assert res_85["final"] == 85
        assert res_85["meets_threshold"] is True


# ===========================================================================
# 6. UNCERTAINTY PRIORITY & HARD RULES TESTS
# ===========================================================================

class TestUncertaintyPriorityAndHardRules:
    """Test suite for Uncertainty Classification priority ordering and Hard Rules.

    Priority Order:
      1. integrity  (Action: 'human_review')
      2. coverage   (Action: 'request_specific_evidence')
      3. visual     (Action: 'retake_image')
      4. context    (Action: 'request_context')
    """

    def test_integrity_wins_when_integrity_and_visual_coexist(self):
        """CRITICAL: Test that integrity wins when integrity and visual issues coexist."""
        quality_eval = {"score": 25, "warnings": ["Blurry image"]}  # Visual issue
        coverage_eval = {"score": 100, "missing_views": []}
        context_eval = {"score": 100, "gps_valid": True, "plot_match": True}
        integrity_eval = {
            "score": 50,
            "sha256_valid": True,
            "mock_gps_detected": True,  # Integrity issue!
            "tamper_indicators": ["mock_gps_detected:mid_canopy"],
        }
        unc = classify_uncertainty(
            final_confidence=50,
            quality_eval=quality_eval,
            coverage_eval=coverage_eval,
            context_eval=context_eval,
            integrity_eval=integrity_eval,
        )
        assert unc["present"] is True
        assert unc["type"] == "integrity"  # Integrity wins!
        assert unc["recommended_action"] == "human_review"
        assert any("Mock GPS" in r for r in unc["reasons"])

    def test_coverage_wins_over_visual_when_both_present(self):
        """CRITICAL: Test that coverage wins over visual when both are present."""
        quality_eval = {"score": 35, "warnings": ["Blurry image"]}  # Visual issue
        coverage_eval = {
            "score": 40,
            "missing_views": ["closeup_damage", "wide_field"],
            "details": {"present_angles": ["left_context", "mid_canopy", "right_context"]},
        }
        context_eval = {"score": 100, "gps_valid": True, "plot_match": True}
        integrity_eval = {"score": 100, "sha256_valid": True, "tamper_indicators": [], "mock_gps_detected": False}

        unc = classify_uncertainty(
            final_confidence=50,
            quality_eval=quality_eval,
            coverage_eval=coverage_eval,
            context_eval=context_eval,
            integrity_eval=integrity_eval,
        )
        assert unc["present"] is True
        assert unc["type"] == "coverage"  # Coverage wins over visual!
        assert unc["recommended_action"] == "request_specific_evidence"
        assert "closeup_damage is missing" in unc["reasons"]

    def test_visual_wins_over_context_when_both_present(self):
        quality_eval = {"score": 30, "warnings": ["Blurry image"]}  # Visual issue
        coverage_eval = {"score": 100, "missing_views": [], "details": {"present_angles": REQUIRED_ANGLES}}
        context_eval = {"score": 30, "gps_valid": False, "plot_match": False}  # Context issue
        integrity_eval = {"score": 100, "sha256_valid": True, "tamper_indicators": [], "mock_gps_detected": False}

        unc = classify_uncertainty(
            final_confidence=50,
            quality_eval=quality_eval,
            coverage_eval=coverage_eval,
            context_eval=context_eval,
            integrity_eval=integrity_eval,
        )
        assert unc["present"] is True
        assert unc["type"] == "visual"  # Visual wins over context!
        assert unc["recommended_action"] == "retake_image"

    def test_context_uncertainty_when_only_context_missing(self):
        quality_eval = {"score": 90, "warnings": []}
        coverage_eval = {"score": 100, "missing_views": [], "details": {"present_angles": REQUIRED_ANGLES}}
        context_eval = {"score": 30, "gps_valid": False, "plot_match": False}  # Only context issue
        integrity_eval = {"score": 100, "sha256_valid": True, "tamper_indicators": [], "mock_gps_detected": False}

        unc = classify_uncertainty(
            final_confidence=72,
            quality_eval=quality_eval,
            coverage_eval=coverage_eval,
            context_eval=context_eval,
            integrity_eval=integrity_eval,
        )
        assert unc["present"] is True
        assert unc["type"] == "context"
        assert unc["recommended_action"] == "request_context"
        assert any("GPS" in r for r in unc["reasons"])

    def test_no_uncertainty_when_all_good_and_confidence_meets_threshold(self):
        quality_eval = {"score": 95, "warnings": []}
        coverage_eval = {"score": 100, "missing_views": [], "details": {"present_angles": REQUIRED_ANGLES}}
        context_eval = {"score": 95, "gps_valid": True, "plot_match": True}
        integrity_eval = {"score": 100, "sha256_valid": True, "tamper_indicators": [], "mock_gps_detected": False}

        unc = classify_uncertainty(
            final_confidence=97,
            quality_eval=quality_eval,
            coverage_eval=coverage_eval,
            context_eval=context_eval,
            integrity_eval=integrity_eval,
        )
        assert unc["present"] is False
        assert unc["type"] is None
        assert unc["recommended_action"] == "normal_human_review"


# ===========================================================================
# 7. SPECIFIC EVIDENCE REQUEST GENERATION TESTS
# ===========================================================================

class TestSpecificEvidenceRequests:
    """Test suite for targeted adaptive recapture requests."""

    def test_missing_closeup_generates_targeted_closeup_request(self):
        uncertainty = {"present": True, "type": "coverage"}
        coverage_eval = {"missing_views": ["closeup_damage"]}
        quality_eval = {}
        context_eval = {}

        req = generate_evidence_request(uncertainty, coverage_eval, quality_eval, context_eval)
        assert req is not None
        assert req["type"] == "specific_evidence"
        assert req["reason_code"] == "missing_closeup"
        assert req["required_angles"] == ["closeup_damage"]
        assert req["title"] == "Capture close-up damage evidence"
        assert "Move closer to the affected crop area" in req["instructions"]

    def test_poor_wide_context_generates_wide_field_request(self):
        uncertainty = {"present": True, "type": "coverage"}
        coverage_eval = {"missing_views": ["wide_field"]}
        quality_eval = {}
        context_eval = {}

        req = generate_evidence_request(uncertainty, coverage_eval, quality_eval, context_eval)
        assert req is not None
        assert req["reason_code"] == "poor_wide_context"
        assert req["required_angles"] == ["wide_field"]
        assert req["title"] == "Capture a wider field view"
        assert "farther back" in req["instructions"]

    def test_visual_blur_generates_retake_blurry_image_request(self):
        uncertainty = {"present": True, "type": "visual"}
        coverage_eval = {"missing_views": []}
        quality_eval = {
            "details": {
                "image_evaluations": [
                    {"angle_type": "mid_canopy", "blur": 15.0, "is_usable": False}
                ]
            }
        }
        context_eval = {}

        req = generate_evidence_request(uncertainty, coverage_eval, quality_eval, context_eval)
        assert req is not None
        assert req["reason_code"] == "blur"
        assert req["required_angles"] == ["mid_canopy"]
        assert req["title"] == "Retake the blurry image"
        assert "steady" in req["instructions"].lower()

    def test_context_missing_gps_request(self):
        uncertainty = {"present": True, "type": "context"}
        coverage_eval = {}
        quality_eval = {}
        context_eval = {"gps_valid": False}

        req = generate_evidence_request(uncertainty, coverage_eval, quality_eval, context_eval)
        assert req is not None
        assert req["type"] == "context_correction"
        assert req["reason_code"] == "missing_gps"
        assert req["required_angles"] == []
        assert "GPS" in req["title"]

    def test_integrity_issue_generates_human_review_request(self):
        uncertainty = {"present": True, "type": "integrity"}
        req = generate_evidence_request(uncertainty, {}, {}, {})
        assert req is not None
        assert req["type"] == "human_review"
        assert req["reason_code"] == "integrity_flag"
        assert req["required_angles"] == []


# ===========================================================================
# 8. COMPLETE END-TO-END DEMO CASES & RE-EVALUATION TESTS
# ===========================================================================

class TestEndToEndEvaluationAndReEvaluation:
    """Test suite for full pipeline evaluation and re-evaluation delta calculation."""

    def test_demo_case_1_good_evidence(self):
        """Case 1: Quality 90+, Coverage 100, Context 90+, Integrity 100 -> Final > 85, No uncertainty."""
        images = [
            {
                "angle_type": angle,
                "sha256": f"abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456789{idx}",
                "perceptual_hash": f"phash_good_{idx}",
                "blur_score": 92.0,
                "brightness_score": 58.0,
                "width": 1920,
                "height": 1080,
                "crop_visibility_score": 90.0,
                "damage_visibility_score": 90.0,
                "is_original_immutable": True,
                "upload_status": "uploaded",
            }
            for idx, angle in enumerate(REQUIRED_ANGLES)
        ]
        sub_data = {
            "capture_lat": 26.8467,
            "capture_lon": 80.9462,
            "capture_accuracy_m": 8.0,
            "plot_distance_meters": 10.0,
            "capture_timestamp": datetime.now(timezone.utc),
            "crop_cycle_id": "c111",
        }
        res = evaluate_submission_evidence(images, submission_data=sub_data)
        assert res["evaluation_version"] == EVALUATION_VERSION
        assert res["quality"]["score"] >= 90
        assert res["coverage"]["score"] == 100
        assert res["context"]["score"] >= 90
        assert res["integrity"]["score"] == 100
        assert res["confidence"]["final"] > 85
        assert res["uncertainty"]["present"] is False
        assert res["request"] is None

    def test_demo_case_2_blurry_evidence(self):
        """Case 2: Quality < 40 -> Visual uncertainty, Retake required."""
        images = [
            {
                "angle_type": angle,
                "sha256": f"111111111111111111111111111111111111111111111111111111111111111{idx}",
                "perceptual_hash": f"phash_{idx}",
                "blur_score": 15.0,  # All blurry
                "quality_flags": {"blur": True},
            }
            for idx, angle in enumerate(REQUIRED_ANGLES)
        ]
        sub_data = {"capture_lat": 26.8467, "capture_lon": 80.9462, "capture_accuracy_m": 8.0}
        res = evaluate_submission_evidence(images, submission_data=sub_data)
        assert res["quality"]["score"] < 40
        assert res["uncertainty"]["present"] is True
        assert res["uncertainty"]["type"] == "visual"
        assert res["uncertainty"]["recommended_action"] == "retake_image"

    def test_demo_case_3_good_images_insufficient_coverage(self):
        """Case 3: Quality high, Coverage < 50 -> Specific evidence request, only missing angles requested."""
        # Only 2 angles provided
        images = [
            {
                "angle_type": "wide_field",
                "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "perceptual_hash": "phash_1",
                "blur_score": 90.0,
                "width": 1920,
                "height": 1080,
            },
            {
                "angle_type": "left_context",
                "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                "perceptual_hash": "phash_2",
                "blur_score": 90.0,
                "width": 1920,
                "height": 1080,
            },
        ]
        sub_data = {"capture_lat": 26.8467, "capture_lon": 80.9462, "capture_accuracy_m": 8.0, "crop_cycle_id": "c1"}
        res = evaluate_submission_evidence(images, submission_data=sub_data)
        assert res["quality"]["score"] >= 80
        assert res["coverage"]["score"] == 40  # 2/5 = 40 < 50
        assert res["uncertainty"]["type"] == "coverage"
        assert res["uncertainty"]["recommended_action"] == "request_specific_evidence"
        assert res["request"] is not None
        assert set(res["request"]["required_angles"]) == {"mid_canopy", "right_context", "closeup_damage"}

    def test_demo_case_5_integrity_issue_forces_human_review(self):
        """Case 5: Integrity failure -> Human review, No automatic photo request."""
        images = [
            {
                "angle_type": angle,
                "sha256": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",  # Duplicate SHA for all!
                "perceptual_hash": "same_phash",
                "blur_score": 95.0,
            }
            for angle in REQUIRED_ANGLES
        ]
        sub_data = {"capture_lat": 26.8467, "capture_lon": 80.9462, "capture_accuracy_m": 8.0}
        res = evaluate_submission_evidence(images, submission_data=sub_data)
        assert res["integrity"]["score"] < 100
        assert res["uncertainty"]["type"] == "integrity"
        assert res["uncertainty"]["recommended_action"] == "human_review"
        assert res["request"]["type"] == "human_review"

    def test_demo_case_6_reevaluation_resolves_issue_and_calculates_delta(self):
        """Case 6: Recapture resolves missing closeup -> Confidence increases from 63 to 89 (delta +26)."""
        initial_images = [
            {
                "angle_type": angle,
                "sha256": f"112233445566778899aabbccddeeff00112233445566778899aabbccddeeff0{idx}",
                "perceptual_hash": f"init_hash_{idx}",
                "blur_score": 85.0,
                "width": 1920,
                "height": 1080,
            }
            for idx, angle in enumerate(["wide_field", "left_context", "mid_canopy", "right_context"])
        ]
        sub_data = {
            "capture_lat": 26.8467,
            "capture_lon": 80.9462,
            "capture_accuracy_m": 10.0,
            "plot_distance_meters": 15.0,
            "capture_timestamp": datetime.now(timezone.utc),
            "crop_cycle_id": "c1",
        }
        initial_eval = evaluate_submission_evidence(initial_images, submission_data=sub_data)
        assert initial_eval["uncertainty"]["present"] is True
        assert initial_eval["uncertainty"]["type"] == "coverage"
        assert "closeup_damage" in initial_eval["coverage"]["missing_views"]

        # Recapture uploaded with missing closeup_damage
        recapture_images = [
            {
                "angle_type": "closeup_damage",
                "sha256": "99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa",
                "perceptual_hash": "recapture_closeup_phash",
                "blur_score": 95.0,
                "width": 1920,
                "height": 1080,
            }
        ]

        # Re-evaluate
        reeval_res = reevaluate_submission_evidence(
            previous_evaluation=initial_eval,
            initial_images=initial_images,
            new_images=recapture_images,
            submission_data=sub_data,
        )

        assert reeval_res["merged_image_count"] == 5
        assert reeval_res["previous_uncertainty"] == "coverage"
        assert reeval_res["new_uncertainty"] is None
        assert reeval_res["new_confidence"] > reeval_res["previous_confidence"]
        assert reeval_res["confidence_delta"] > 0
        assert reeval_res["evaluation"]["coverage"]["score"] == 100
        assert reeval_res["evaluation"]["confidence"]["meets_threshold"] is True

    def test_merge_recapture_evidence_supersedes_old_angles(self):
        initial = [
            {"angle_type": "wide_field", "id": 1, "blur_score": 20.0},
            {"angle_type": "left_context", "id": 2, "blur_score": 80.0},
        ]
        new_evidence = [
            {"angle_type": "wide_field", "id": 3, "blur_score": 95.0},  # Replaces blurry wide_field
        ]
        merged = merge_recapture_evidence(initial, new_evidence)
        assert len(merged) == 2
        wide_entry = next(m for m in merged if m["angle_type"] == "wide_field")
        assert wide_entry["id"] == 3
        assert wide_entry["blur_score"] == 95.0
