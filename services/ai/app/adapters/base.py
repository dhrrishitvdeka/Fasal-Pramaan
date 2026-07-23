"""ModelAdapter interface — versioned, replaceable inference contract."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


DAMAGE_CATEGORIES = [
    "healthy",
    "lodging",
    "flood",
    "waterlogging",
    "drought_stress",
    "pest",
    "disease",
    "hail_storm",
    "fire",
    "nutrient_deficiency",
    "weed_pressure",
    "unknown",
]


class ModelAdapter(ABC):
    """
    Pluggable model interface.

    Implementations MUST:
    - Return structured JSON matching the service schema.
    - Set is_production_validated=False unless formally validated.
    - Never invent accuracy metrics for untrained models.
    """

    name: str
    version: str
    adapter_type: str
    is_production_validated: bool = False

    @abstractmethod
    def analyze(self, request: dict[str, Any]) -> dict[str, Any]:
        """Run full pipeline for a submission request."""
