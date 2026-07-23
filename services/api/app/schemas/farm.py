"""Farm / plot / crop cycle schemas."""

from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORMModel


class FarmCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    village_id: Optional[UUID] = None
    total_area_hectares: Optional[float] = Field(default=None, gt=0, le=100_000)
    notes: Optional[str] = Field(default=None, max_length=5000)
    farmer_profile_id: Optional[UUID] = None  # field officer creating for farmer


class FarmUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    total_area_hectares: Optional[float] = Field(default=None, gt=0, le=100_000)
    notes: Optional[str] = Field(default=None, max_length=5000)


class FarmOut(ORMModel):
    id: UUID
    farmer_id: UUID
    name: str
    village_id: Optional[UUID] = None
    total_area_hectares: Optional[float] = None
    notes: Optional[str] = None


class PlotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    survey_number: Optional[str] = Field(default=None, max_length=64)
    area_hectares: Optional[float] = Field(default=None, gt=0, le=100_000)
    # GeoJSON-like ring: list of [lon, lat]
    boundary_coords: Optional[list[list[float]]] = Field(default=None, min_length=3, max_length=5000)
    centroid_lon: Optional[float] = Field(default=None, ge=-180, le=180)
    centroid_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    soil_type: Optional[str] = Field(default=None, max_length=64)
    irrigation_type: Optional[str] = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def validate_centroid_pair(self):
        if (self.centroid_lon is None) != (self.centroid_lat is None):
            raise ValueError("centroid_lon and centroid_lat must be supplied together")
        return self


class PlotOut(ORMModel):
    id: UUID
    farm_id: UUID
    name: str
    survey_number: Optional[str] = None
    area_hectares: Optional[float] = None
    soil_type: Optional[str] = None
    irrigation_type: Optional[str] = None
    centroid_lat: Optional[float] = None
    centroid_lon: Optional[float] = None


class CropTypeOut(ORMModel):
    id: UUID
    code: str
    name: str
    name_hi: Optional[str] = None
    season: Optional[str] = None


class GrowthStageOut(ORMModel):
    id: UUID
    code: str
    name: str
    name_hi: Optional[str] = None
    sequence_order: int
    crop_type_id: Optional[UUID] = None


class CropCycleCreate(BaseModel):
    plot_id: UUID
    crop_type_id: UUID
    crop_variety_id: Optional[UUID] = None
    season_year: int = Field(ge=2000, le=2200)
    season: str = Field(pattern="^(kharif|rabi|zaid)$")
    sowing_date: Optional[date] = None
    expected_harvest_date: Optional[date] = None
    current_growth_stage_id: Optional[UUID] = None
    insurance_policy_ref: Optional[str] = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.sowing_date and self.expected_harvest_date:
            if self.expected_harvest_date < self.sowing_date:
                raise ValueError("expected_harvest_date cannot precede sowing_date")
        return self


class CropCycleOut(ORMModel):
    id: UUID
    plot_id: UUID
    crop_type_id: UUID
    season_year: int
    season: str
    sowing_date: Optional[date] = None
    expected_harvest_date: Optional[date] = None
    current_growth_stage_id: Optional[UUID] = None
    status: str
    insurance_policy_ref: Optional[str] = None
