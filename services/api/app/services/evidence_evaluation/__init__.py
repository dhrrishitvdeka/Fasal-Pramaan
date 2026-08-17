"""Pure backend Evidence Evaluation domain engine for Fasal-Pramaan.

Provides four-dimensional evidence confidence calculation, uncertainty classification,
adaptive recapture request generation, and re-evaluation tracking.
"""

from __future__ import annotations

from app.services.evidence_evaluation.context import evaluate_evidence_context
from app.services.evidence_evaluation.coverage import (
    REQUIRED_ANGLES,
    evaluate_evidence_coverage,
)
from app.services.evidence_evaluation.engine import (
    DEFAULT_CONFIDENCE_THRESHOLD,
    EVALUATION_VERSION,
    EVIDENCE_COVERAGE_REQUEST_THRESHOLD,
    EVIDENCE_QUALITY_RETAKE_THRESHOLD,
    WEIGHT_CONTEXT,
    WEIGHT_COVERAGE,
    WEIGHT_INTEGRITY,
    WEIGHT_QUALITY,
    calculate_final_evidence_confidence,
    classify_uncertainty,
    evaluate_submission_evidence,
    generate_evidence_request,
)
from app.services.evidence_evaluation.integrity import evaluate_evidence_integrity
from app.services.evidence_evaluation.quality import evaluate_evidence_quality
from app.services.evidence_evaluation.reevaluation import reevaluate_submission_evidence

__all__ = [
    "DEFAULT_CONFIDENCE_THRESHOLD",
    "EVALUATION_VERSION",
    "EVIDENCE_COVERAGE_REQUEST_THRESHOLD",
    "EVIDENCE_QUALITY_RETAKE_THRESHOLD",
    "REQUIRED_ANGLES",
    "WEIGHT_CONTEXT",
    "WEIGHT_COVERAGE",
    "WEIGHT_INTEGRITY",
    "WEIGHT_QUALITY",
    "calculate_final_evidence_confidence",
    "classify_uncertainty",
    "evaluate_evidence_context",
    "evaluate_evidence_coverage",
    "evaluate_evidence_integrity",
    "evaluate_evidence_quality",
    "evaluate_submission_evidence",
    "generate_evidence_request",
    "reevaluate_submission_evidence",
]
