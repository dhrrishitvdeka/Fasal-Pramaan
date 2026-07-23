"""Farms, plots, crops, cycles."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from app.core.deps import (
    ROLE_ADMIN,
    ROLE_FARMER,
    ROLE_FIELD_OFFICER,
    ROLE_REVIEWER,
    CurrentUser,
    DbSession,
    field_officer_can_access_jurisdiction,
    field_officer_farm_filter,
    user_role_codes,
)
from app.db.models import CropCycle, CropType, CropVariety, Farm, FarmerProfile, GrowthStage, Plot
from app.schemas.common import MessageOut, Paginated
from app.schemas.farm import (
    CropCycleCreate,
    CropCycleOut,
    CropTypeOut,
    FarmCreate,
    FarmOut,
    FarmUpdate,
    GrowthStageOut,
    PlotCreate,
    PlotOut,
)
from app.services.audit import write_audit
from app.services.geo import point_wkt, polygon_centroid, polygon_from_ring

router = APIRouter(tags=["Farms & Crops"])


def _farmer_profile(db: DbSession, user: CurrentUser) -> FarmerProfile | None:
    return db.query(FarmerProfile).filter(FarmerProfile.user_id == user.id).first()


def _check_farm_access(db: DbSession, user: CurrentUser, farm_id: str, *, write: bool = False) -> Farm:
    """Reviewers have cross-farm read access; only owners, officers, and admins may write."""
    farm = db.query(Farm).filter(Farm.id == farm_id, Farm.is_deleted.is_(False)).first()
    if not farm:
        raise HTTPException(404, "Farm not found")
    roles = set(user_role_codes(user))
    if ROLE_ADMIN in roles:
        return farm
    if ROLE_FIELD_OFFICER in roles:
        allowed = db.query(Farm.id).filter(Farm.id == farm.id, field_officer_farm_filter(db, user)).first()
        if allowed:
            return farm
        raise HTTPException(403, "Farm is outside the field officer's jurisdiction")
    if not write and ROLE_REVIEWER in roles:
        return farm
    profile = _farmer_profile(db, user)
    if not profile or farm.farmer_id != profile.id:
        raise HTTPException(403, "Not allowed to access this farm")
    return farm


def _check_plot_access(db: DbSession, user: CurrentUser, plot_id: str, *, write: bool = False) -> Plot:
    plot = db.query(Plot).filter(Plot.id == plot_id, Plot.is_deleted.is_(False)).first()
    if not plot:
        raise HTTPException(404, "Plot not found")
    _check_farm_access(db, user, str(plot.farm_id), write=write)
    return plot


def _check_cycle_access(db: DbSession, user: CurrentUser, cycle_id: str) -> CropCycle:
    cycle = db.query(CropCycle).filter(CropCycle.id == cycle_id, CropCycle.is_deleted.is_(False)).first()
    if not cycle:
        raise HTTPException(404, "Crop cycle not found")
    _check_plot_access(db, user, str(cycle.plot_id))
    return cycle


def _plot_out(db: DbSession, plot: Plot) -> PlotOut:
    lat = lon = None
    if plot.centroid is not None:
        row = db.execute(
            text("SELECT ST_Y(centroid::geometry) AS lat, ST_X(centroid::geometry) AS lon FROM plots WHERE id = :id"),
            {"id": str(plot.id)},
        ).first()
        if row:
            lat, lon = row.lat, row.lon
    return PlotOut(
        id=plot.id,
        farm_id=plot.farm_id,
        name=plot.name,
        survey_number=plot.survey_number,
        area_hectares=plot.area_hectares,
        soil_type=plot.soil_type,
        irrigation_type=plot.irrigation_type,
        centroid_lat=lat,
        centroid_lon=lon,
    )


@router.get("/crops", response_model=list[CropTypeOut])
def list_crops(db: DbSession, user: CurrentUser) -> list[CropType]:
    return db.query(CropType).filter(CropType.is_deleted.is_(False)).order_by(CropType.name).all()


@router.get("/growth-stages", response_model=list[GrowthStageOut])
def list_stages(
    db: DbSession,
    user: CurrentUser,
    crop_type_id: str | None = None,
) -> list[GrowthStage]:
    q = db.query(GrowthStage).filter(GrowthStage.is_deleted.is_(False))
    if crop_type_id:
        q = q.filter((GrowthStage.crop_type_id == crop_type_id) | (GrowthStage.crop_type_id.is_(None)))
    return q.order_by(GrowthStage.sequence_order).all()


@router.post("/farms", response_model=FarmOut, status_code=201)
def create_farm(body: FarmCreate, db: DbSession, user: CurrentUser) -> Farm:
    roles = set(user_role_codes(user))
    if ROLE_FARMER in roles:
        profile = _farmer_profile(db, user)
        if not profile:
            raise HTTPException(400, "Farmer profile missing")
        farmer_id = profile.id
    elif roles.intersection({ROLE_FIELD_OFFICER, ROLE_ADMIN}):
        if not body.farmer_profile_id:
            raise HTTPException(400, "farmer_profile_id required for officers")
        target = db.query(FarmerProfile).filter(
            FarmerProfile.id == body.farmer_profile_id,
            FarmerProfile.is_deleted.is_(False),
        ).first()
        if not target:
            raise HTTPException(400, "Farmer profile not found")
        if ROLE_FIELD_OFFICER in roles and ROLE_ADMIN not in roles:
            target_jurisdiction = body.village_id or target.village_id
            if not field_officer_can_access_jurisdiction(db, user, target_jurisdiction):
                raise HTTPException(403, "Farmer is outside the field officer's jurisdiction")
        farmer_id = body.farmer_profile_id
    else:
        raise HTTPException(403, "Not allowed to create farms")
    farm = Farm(
        farmer_id=farmer_id,
        name=body.name,
        village_id=body.village_id,
        total_area_hectares=body.total_area_hectares,
        notes=body.notes,
        created_by=user.id,
    )
    db.add(farm)
    db.flush()
    write_audit(db, action="create", entity_type="farm", entity_id=str(farm.id), actor_id=user.id, after=body.model_dump(mode="json"))
    db.commit()
    db.refresh(farm)
    return farm


@router.get("/farms", response_model=Paginated[FarmOut])
def list_farms(
    db: DbSession,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Paginated[FarmOut]:
    q = db.query(Farm).filter(Farm.is_deleted.is_(False))
    roles = set(user_role_codes(user))
    if ROLE_FIELD_OFFICER in roles and ROLE_ADMIN not in roles:
        q = q.filter(field_officer_farm_filter(db, user))
    elif not roles.intersection({ROLE_ADMIN, ROLE_REVIEWER}):
        profile = _farmer_profile(db, user)
        if not profile:
            return Paginated(items=[], total=0, page=page, page_size=page_size, pages=0)
        q = q.filter(Farm.farmer_id == profile.id)
    total = q.count()
    items = q.order_by(Farm.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    pages = (total + page_size - 1) // page_size if total else 0
    return Paginated(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.get("/farms/{farm_id}", response_model=FarmOut)
def get_farm(farm_id: str, db: DbSession, user: CurrentUser) -> Farm:
    return _check_farm_access(db, user, farm_id)


@router.patch("/farms/{farm_id}", response_model=FarmOut)
def update_farm(farm_id: str, body: FarmUpdate, db: DbSession, user: CurrentUser) -> Farm:
    farm = _check_farm_access(db, user, farm_id, write=True)
    before = {"name": farm.name, "total_area_hectares": farm.total_area_hectares, "notes": farm.notes}
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(farm, k, v)
    farm.version += 1
    write_audit(db, action="update", entity_type="farm", entity_id=str(farm.id), actor_id=user.id, before=before, after=body.model_dump(mode="json", exclude_unset=True))
    db.commit()
    db.refresh(farm)
    return farm


@router.delete("/farms/{farm_id}", response_model=MessageOut)
def archive_farm(farm_id: str, db: DbSession, user: CurrentUser) -> MessageOut:
    farm = _check_farm_access(db, user, farm_id, write=True)
    farm.is_deleted = True
    farm.deleted_at = datetime.now(timezone.utc)
    write_audit(db, action="archive", entity_type="farm", entity_id=str(farm.id), actor_id=user.id)
    db.commit()
    return MessageOut(message="Farm archived")


@router.post("/farms/{farm_id}/plots", response_model=PlotOut, status_code=201)
def create_plot(farm_id: str, body: PlotCreate, db: DbSession, user: CurrentUser) -> PlotOut:
    farm = _check_farm_access(db, user, farm_id, write=True)
    plot = Plot(
        farm_id=farm.id,
        name=body.name,
        survey_number=body.survey_number,
        area_hectares=body.area_hectares,
        soil_type=body.soil_type,
        irrigation_type=body.irrigation_type,
    )
    if body.boundary_coords:
        plot.boundary = polygon_from_ring(body.boundary_coords)
    if body.centroid_lon is not None and body.centroid_lat is not None:
        plot.centroid = point_wkt(body.centroid_lon, body.centroid_lat)
    elif body.boundary_coords:
        plot.centroid = polygon_centroid(body.boundary_coords)
    db.add(plot)
    db.flush()
    write_audit(db, action="create", entity_type="plot", entity_id=str(plot.id), actor_id=user.id, after={"farm_id": str(farm.id), "name": body.name})
    db.commit()
    db.refresh(plot)
    return _plot_out(db, plot)


@router.get("/farms/{farm_id}/plots", response_model=list[PlotOut])
def list_plots(farm_id: str, db: DbSession, user: CurrentUser) -> list[PlotOut]:
    farm = _check_farm_access(db, user, farm_id)
    plots = db.query(Plot).filter(Plot.farm_id == farm.id, Plot.is_deleted.is_(False)).all()
    return [_plot_out(db, p) for p in plots]


@router.get("/plots/{plot_id}", response_model=PlotOut)
def get_plot(plot_id: str, db: DbSession, user: CurrentUser) -> PlotOut:
    plot = _check_plot_access(db, user, plot_id)
    return _plot_out(db, plot)


@router.post("/crop-cycles", response_model=CropCycleOut, status_code=201)
def create_cycle(body: CropCycleCreate, db: DbSession, user: CurrentUser) -> CropCycle:
    _check_plot_access(db, user, str(body.plot_id), write=True)
    crop = db.query(CropType).filter(CropType.id == body.crop_type_id, CropType.is_deleted.is_(False)).first()
    if not crop:
        raise HTTPException(400, "Crop type not found")
    if body.crop_variety_id:
        variety = db.query(CropVariety).filter(
            CropVariety.id == body.crop_variety_id,
            CropVariety.crop_type_id == body.crop_type_id,
            CropVariety.is_deleted.is_(False),
        ).first()
        if not variety:
            raise HTTPException(400, "Crop variety does not belong to the selected crop")
    if body.current_growth_stage_id:
        stage = db.query(GrowthStage).filter(
            GrowthStage.id == body.current_growth_stage_id,
            GrowthStage.is_deleted.is_(False),
        ).first()
        if not stage or stage.crop_type_id not in (None, body.crop_type_id):
            raise HTTPException(400, "Growth stage does not belong to the selected crop")
    cycle = CropCycle(**body.model_dump())
    db.add(cycle)
    db.flush()
    write_audit(db, action="create", entity_type="crop_cycle", entity_id=str(cycle.id), actor_id=user.id, after=body.model_dump(mode="json"))
    db.commit()
    db.refresh(cycle)
    return cycle


@router.get("/crop-cycles", response_model=list[CropCycleOut])
def list_cycles(
    db: DbSession,
    user: CurrentUser,
    plot_id: str | None = None,
) -> list[CropCycle]:
    q = (
        db.query(CropCycle)
        .join(Plot, Plot.id == CropCycle.plot_id)
        .join(Farm, Farm.id == Plot.farm_id)
        .filter(
            CropCycle.is_deleted.is_(False),
            Plot.is_deleted.is_(False),
            Farm.is_deleted.is_(False),
        )
    )
    if plot_id:
        # If plot_id is requested, verify the user has access to it first
        _check_plot_access(db, user, plot_id)
        q = q.filter(CropCycle.plot_id == plot_id)
    roles = set(user_role_codes(user))
    if ROLE_FIELD_OFFICER in roles and ROLE_ADMIN not in roles:
        q = q.filter(field_officer_farm_filter(db, user))
    elif not roles.intersection({ROLE_ADMIN, ROLE_REVIEWER}):
        profile = _farmer_profile(db, user)
        if not profile:
            return []
        q = (
            q.filter(Farm.farmer_id == profile.id)
        )
    return q.order_by(CropCycle.created_at.desc()).limit(200).all()


@router.get("/crop-cycles/{cycle_id}", response_model=CropCycleOut)
def get_cycle(cycle_id: str, db: DbSession, user: CurrentUser) -> CropCycle:
    return _check_cycle_access(db, user, cycle_id)
