"""Geospatial helpers using WKT for PostGIS."""

from __future__ import annotations

from geoalchemy2.elements import WKTElement
from shapely.geometry import Polygon
from sqlalchemy import text
from sqlalchemy.orm import Session


def point_wkt(lon: float, lat: float) -> WKTElement:
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


def polygon_from_ring(coords: list[list[float]]) -> WKTElement:
    """coords: list of [lon, lat], closed automatically if needed."""
    if len(coords) < 3:
        raise ValueError("Boundary requires at least three points")
    if any(len(c) != 2 or not (-180 <= c[0] <= 180) or not (-90 <= c[1] <= 90) for c in coords):
        raise ValueError("Boundary coordinates must be valid [longitude, latitude] pairs")
    ring = list(coords)
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    polygon = Polygon(ring)
    if polygon.is_empty or not polygon.is_valid or polygon.area <= 0:
        raise ValueError("Boundary must be a valid non-self-intersecting polygon")
    pairs = ", ".join(f"{c[0]} {c[1]}" for c in ring)
    return WKTElement(f"POLYGON(({pairs}))", srid=4326)


def polygon_centroid(coords: list[list[float]]) -> WKTElement:
    polygon = Polygon(coords)
    if polygon.is_empty or not polygon.is_valid or polygon.area <= 0:
        raise ValueError("Boundary must be a valid non-self-intersecting polygon")
    return point_wkt(float(polygon.centroid.x), float(polygon.centroid.y))


def distance_meters(db: Session, lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    row = db.execute(
        text(
            """
            SELECT ST_Distance(
              ST_SetSRID(ST_MakePoint(:lon1, :lat1), 4326)::geography,
              ST_SetSRID(ST_MakePoint(:lon2, :lat2), 4326)::geography
            ) AS meters
            """
        ),
        {"lon1": lon1, "lat1": lat1, "lon2": lon2, "lat2": lat2},
    ).first()
    return float(row.meters) if row else 0.0


def point_distance_to_plot(
    db: Session, plot_id, lon: float, lat: float
) -> float | None:
    row = db.execute(
        text(
            """
            SELECT ST_Distance(
              COALESCE(centroid, ST_Centroid(boundary::geometry)::geography),
              ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
            ) AS meters
            FROM plots WHERE id = :plot_id
            """
        ),
        {"lon": lon, "lat": lat, "plot_id": str(plot_id)},
    ).first()
    if row is None or row.meters is None:
        return None
    return float(row.meters)
