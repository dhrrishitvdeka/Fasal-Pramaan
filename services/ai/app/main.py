"""FasalPramaan AI service HTTP API."""

from __future__ import annotations

from datetime import datetime, timezone
import logging
import os
import secrets
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app import __version__
from app.adapters import get_adapter
from app.adapters.crop_vit import CropViTAdapter
from app.adapters.crop_health_v3 import CropHealthViTV3Adapter
from app.adapters.crop_health_v4 import CropHealthDinoV4Adapter
from app.adapters.hierarchical import HierarchicalAdapter
from app.adapters.plant_disease import PlantDiseaseAdapter
from app.pipeline.stages import HF_CROP_VIT_ID, HF_DAMAGE_VIT_ID

logger = logging.getLogger(__name__)
_ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
_SERVICE_TOKEN = os.getenv("AI_SERVICE_TOKEN", "")
_IS_PRODUCTION = _ENVIRONMENT not in {"development", "dev", "test", "local"}
_ALLOW_MOCK_FALLBACK = os.getenv("AI_ALLOW_MOCK_FALLBACK", "false").lower() in {
    "1",
    "true",
    "yes",
}
if _IS_PRODUCTION and len(_SERVICE_TOKEN) < 32:
    raise RuntimeError("AI_SERVICE_TOKEN must be configured with at least 32 characters in production")
if _IS_PRODUCTION and _ALLOW_MOCK_FALLBACK:
    raise RuntimeError("AI_ALLOW_MOCK_FALLBACK must be false in production")


def require_service_token(x_service_token: str | None = Header(default=None)) -> None:
    if _SERVICE_TOKEN and not (x_service_token and secrets.compare_digest(x_service_token, _SERVICE_TOKEN)):
        raise HTTPException(status_code=401, detail="Invalid service credential")

app = FastAPI(
    title="FasalPramaan AI Service",
    description=(
        "Crop image analysis with a local crop-conditioned DINOv2 screening model, "
        "hierarchical quality/crop checks, legacy MobileNetV2, and test adapters. "
        "NON-PRODUCTION for insurance decisions unless formally validated."
    ),
    version=__version__,
)


class AnalyzeRequest(BaseModel):
    submission_id: str
    expected_crop: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    images: list[dict[str, Any]] = Field(default_factory=list)
    adapter: str | None = None


@app.get("/health")
def health() -> JSONResponse:
    pd = PlantDiseaseAdapter()
    try:
        default = get_adapter()
        default_adapter = default.adapter_type
        readiness = getattr(default, "readiness", None)
        default_ready, readiness_error = readiness() if readiness else (True, None)
    except Exception as exc:  # noqa: BLE001
        default_adapter = "unavailable"
        default_ready = False
        readiness_error = "Model unavailable" if _IS_PRODUCTION else f"{type(exc).__name__}: {exc}"
    payload = {
        "status": "ok" if default_ready else "degraded",
        "service": "fasalpramaan-ai",
        "version": __version__,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "default_adapter": default_adapter,
        "plant_disease_checkpoint": pd.available(),
        "crop_vit_model": CropViTAdapter().available(),
        "crop_health_v3_model": CropHealthViTV3Adapter().available(),
        "crop_health_v4_model": CropHealthDinoV4Adapter().available(),
        "inference_ready": default_ready,
        "readiness_error": readiness_error,
    }
    return JSONResponse(payload, status_code=200 if default_ready else 503)


@app.get("/v1/models", dependencies=[Depends(require_service_token)])
def list_models() -> list[dict]:
    mock = get_adapter("mock")
    baseline = get_adapter("baseline")
    pd = PlantDiseaseAdapter()
    vit = CropViTAdapter()
    v3 = CropHealthViTV3Adapter()
    v4 = CropHealthDinoV4Adapter()
    hier = HierarchicalAdapter()
    return [
        {
            "name": v4.name,
            "version": v4.version,
            "adapter_type": v4.adapter_type,
            "is_production_validated": False,
            "promotion_status": v4.meta["promotion_status"],
            "checkpoint_available": v4.available(),
            "supported_crops": sorted(v4.supported_crops),
            "screening_grades": ["A", "B", "C", "U"],
            "human_review_required": True,
            "rollback_adapter": v4.meta["rollback_adapter"],
        },
        {
            "name": v3.name,
            "version": v3.version,
            "adapter_type": v3.adapter_type,
            "is_production_validated": False,
            "promotion_status": v3.meta["promotion_status"],
            "checkpoint_available": v3.available(),
            "supported_crops": sorted(v3.supported_crops),
            "screening_grades": ["A", "B", "C", "U"],
            "human_review_required": True,
            "rollback_adapter": v3.meta["rollback_adapter"],
        },
        {
            "name": vit.name,
            "version": vit.version,
            "adapter_type": vit.adapter_type,
            "is_production_validated": False,
            "checkpoint_available": vit.available(),
            "supported_crops": sorted(vit.supported_crops),
            "screening_grades": ["A", "B", "C", "U"],
        },
        {
            "name": mock.name,
            "version": mock.version,
            "adapter_type": mock.adapter_type,
            "is_production_validated": mock.is_production_validated,
        },
        {
            "name": baseline.name,
            "version": baseline.version,
            "adapter_type": baseline.adapter_type,
            "is_production_validated": baseline.is_production_validated,
        },
        {
            "name": pd.name,
            "version": pd.version,
            "adapter_type": pd.adapter_type,
            "is_production_validated": False,
            "checkpoint_available": pd.available(),
        },
        {
            "name": hier.name,
            "version": hier.version,
            "adapter_type": hier.adapter_type,
            "is_production_validated": False,
            "stages": ["quality_ood", "crop_species", "damage"],
            "hf_hooks": {
                "crop_vit": HF_CROP_VIT_ID,
                "damage_vit": HF_DAMAGE_VIT_ID,
            },
        },
    ]


@app.post("/v1/analyze", dependencies=[Depends(require_service_token)])
def analyze(body: AnalyzeRequest) -> dict[str, Any]:
    try:
        adapter = get_adapter(body.adapter)
        result = adapter.analyze(body.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="Model unavailable") from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("inference_failed")
        raise HTTPException(status_code=500, detail="Inference failed") from exc
    if not result.get("is_production_validated"):
        result.setdefault(
            "development_disclaimer",
            "NON-PRODUCTION prediction — human review required for insurance decisions.",
        )
    return result
