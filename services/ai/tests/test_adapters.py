"""AI adapter contract tests."""

import pytest

from app.adapters import get_adapter
from app.adapters.base import DAMAGE_CATEGORIES


def test_mock_deterministic():
    a = get_adapter("mock")
    r1 = a.analyze({"submission_id": "abc", "expected_crop": "soybean", "images": []})
    r2 = a.analyze({"submission_id": "abc", "expected_crop": "soybean", "images": []})
    assert r1["primary_damage"] == r2["primary_damage"]
    assert r1["overall_confidence"] == r2["overall_confidence"]
    assert r1["is_production_validated"] is False
    assert "NON-PRODUCTION" in r1["development_disclaimer"]
    assert r1["adapter_type"] == "mock"


def test_mock_damage_categories_complete():
    a = get_adapter("mock")
    r = a.analyze({"submission_id": "xyz", "images": [{"byte_size": 5000}]})
    for cat in DAMAGE_CATEGORIES:
        assert cat in r["damage_categories"]
    assert r["human_review_recommendation"] in {
        "normal_review",
        "low_confidence_review",
        "urgent_review",
        "recapture",
        "physical_inspection",
    }


def test_baseline_adapter_schema():
    a = get_adapter("baseline")
    r = a.analyze(
        {
            "submission_id": "base-1",
            "expected_crop": "paddy",
            "images": [],
            "metadata": {},
        }
    )
    assert r["adapter_type"] == "baseline"
    assert r["is_production_validated"] is False
    assert "severity" in r
    assert "overall_confidence" in r


def test_unknown_class_handling():
    a = get_adapter("mock")
    r = a.analyze({"submission_id": "u", "images": [{"byte_size": 100}]})
    assert "unknown" in r["damage_categories"]


def test_unknown_adapter_is_rejected_instead_of_mocked():
    with pytest.raises(ValueError, match="Unknown AI model adapter"):
        get_adapter("typo-or-unsupported")
