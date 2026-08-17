"""Evidence Context evaluation module.

Evaluates contextual metadata:
- GPS validity (latitude / longitude within valid bounds, not null/zero)
- GPS accuracy (capture accuracy <= 50.0m)
- Plot proximity (distance to plot centroid/boundary <= 200.0m)
- Capture timestamp (valid, not future)
- Crop-cycle metadata (crop type, variety, season, growth stage)
- Location consistency across images
- Weather: explicitly records availability; if unavailable, sets:
  available=False, score=None, reason='weather_source_not_configured'
  (NEVER treats missing weather as passed/100).

Output normalized to [0, 100].
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.evidence_evaluation.quality import _extract_val

DEFAULT_GPS_ACCURACY_LIMIT_METERS = 50.0
DEFAULT_PLOT_PROXIMITY_LIMIT_METERS = 200.0


def evaluate_evidence_context(
    submission_data: dict[str, Any] | Any,
    plot_data: dict[str, Any] | Any | None = None,
    weather_data: dict[str, Any] | Any | None = None,
    images: list[dict[str, Any] | Any] | None = None,
    *,
    gps_accuracy_limit: float = DEFAULT_GPS_ACCURACY_LIMIT_METERS,
    plot_proximity_limit: float = DEFAULT_PLOT_PROXIMITY_LIMIT_METERS,
    **kwargs: Any,
) -> dict[str, Any]:
    """Evaluate Evidence Context score and metadata signals.

    Returns:
        dict containing:
        - score: int [0, 100]
        - available: bool
        - gps_valid: bool
        - gps_accuracy_valid: bool
        - plot_match: bool
        - capture_time_available: bool
        - crop_context_available: bool
        - location_consistent: bool
        - weather: dict with available, score, reason
        - warnings: list[str]
        - details: dict
    """
    warnings: list[str] = []

    # 1. GPS Validity
    lat = _extract_val(submission_data, "capture_lat")
    lon = _extract_val(submission_data, "capture_lon")

    gps_valid = False
    if lat is not None and lon is not None:
        try:
            f_lat = float(lat)
            f_lon = float(lon)
            # Valid coordinate ranges, and not placeholder (0, 0)
            if -90.0 <= f_lat <= 90.0 and -180.0 <= f_lon <= 180.0 and not (f_lat == 0.0 and f_lon == 0.0):
                gps_valid = True
            else:
                warnings.append("GPS coordinates out of valid geographical bounds or zeroed")
        except (ValueError, TypeError):
            warnings.append("Invalid GPS coordinate format")
    else:
        warnings.append("GPS capture location is missing")

    # 2. GPS Accuracy
    accuracy_m = _extract_val(submission_data, "capture_accuracy_m")
    gps_accuracy_valid = False
    if gps_valid and accuracy_m is not None:
        try:
            f_acc = float(accuracy_m)
            if 0.0 <= f_acc <= gps_accuracy_limit:
                gps_accuracy_valid = True
            else:
                warnings.append(
                    f"GPS accuracy ({f_acc:.1f}m) exceeds acceptable threshold ({gps_accuracy_limit:.1f}m)"
                )
        except (ValueError, TypeError):
            warnings.append("Invalid GPS accuracy value")
    elif gps_valid:
        # GPS present but accuracy unspecified: partially valid
        gps_accuracy_valid = False
        warnings.append("GPS accuracy metadata is missing")

    # 3. Plot Proximity / Match
    plot_match = False
    plot_dist = _extract_val(submission_data, "plot_distance_meters")
    if plot_dist is None and plot_data is not None:
        plot_dist = _extract_val(plot_data, "distance_meters")

    if plot_dist is not None:
        try:
            f_dist = float(plot_dist)
            if f_dist <= plot_proximity_limit:
                plot_match = True
            else:
                warnings.append(
                    f"Capture location distance ({f_dist:.1f}m) exceeds plot boundary tolerance ({plot_proximity_limit:.1f}m)"
                )
        except (ValueError, TypeError):
            warnings.append("Invalid plot distance value")
    elif plot_data is not None and gps_valid:
        # If plot data is provided and gps is valid, check if plot match flag was computed
        is_matched = _extract_val(plot_data, "is_matched")
        if is_matched is not None:
            plot_match = bool(is_matched)
        else:
            plot_match = True  # Plot data present and coordinates within plot
    elif gps_valid:
        # Default plot match assumption when no explicit plot boundary conflict
        plot_match = True
    else:
        plot_match = False

    # 4. Capture Timestamp Validity
    cap_time = _extract_val(submission_data, "capture_timestamp") or _extract_val(
        submission_data, "captured_at"
    )
    capture_time_available = False
    if cap_time is not None:
        if isinstance(cap_time, datetime):
            now_utc = datetime.now(timezone.utc)
            dt_to_check = cap_time.astimezone(timezone.utc) if cap_time.tzinfo else cap_time.replace(tzinfo=timezone.utc)
            if dt_to_check <= now_utc:
                capture_time_available = True
            else:
                warnings.append("Capture timestamp is in the future")
        elif isinstance(cap_time, str) and cap_time.strip():
            capture_time_available = True
    else:
        warnings.append("Capture timestamp is missing")

    # 5. Crop-Cycle Context
    crop_cycle_id = _extract_val(submission_data, "crop_cycle_id")
    crop_type = _extract_val(submission_data, "crop_type") or _extract_val(
        submission_data, "crop_type_id"
    )
    growth_stage = _extract_val(submission_data, "growth_stage_id") or _extract_val(
        submission_data, "growth_stage"
    )
    crop_context_available = bool(crop_cycle_id or crop_type or growth_stage)
    if not crop_context_available:
        warnings.append("Crop cycle contextual metadata is missing")

    # 6. Location Consistency across Images
    location_consistent = True
    if images and len(images) > 1 and gps_valid:
        img_coords: list[tuple[float, float]] = []
        for img in images:
            i_lat = _extract_val(img, "capture_lat")
            i_lon = _extract_val(img, "capture_lon")
            if i_lat is not None and i_lon is not None:
                try:
                    img_coords.append((float(i_lat), float(i_lon)))
                except (ValueError, TypeError):
                    pass
        if len(img_coords) > 1:
            # Check maximum distance spread across images (~0.001 deg is ~111m)
            lats = [c[0] for c in img_coords]
            lons = [c[1] for c in img_coords]
            lat_spread = max(lats) - min(lats)
            lon_spread = max(lons) - min(lons)
            if lat_spread > 0.005 or lon_spread > 0.005:  # > ~500m spread
                location_consistent = False
                warnings.append("Image capture GPS coordinates are inconsistent across angles")

    # 7. Weather handling - Distinguish unknown from passed
    if weather_data is not None and (
        isinstance(weather_data, dict) and weather_data.get("available") is True
    ):
        weather_info = {
            "available": True,
            "score": weather_data.get("score", 85),
            "reason": weather_data.get("reason", "weather_verified"),
            "data": weather_data.get("data", {}),
        }
    else:
        weather_info = {
            "available": False,
            "score": None,
            "reason": "weather_source_not_configured",
        }

    # Context Score Calculation (0-100)
    # Weights for available signals:
    # GPS Valid: 30%
    # GPS Accuracy Valid: 20%
    # Plot Match: 25%
    # Capture Time Valid: 15%
    # Crop Context: 10%
    # Location Consistent: multiplier / penalty

    gps_score = 30.0 if gps_valid else 0.0
    accuracy_score = 20.0 if gps_accuracy_valid else (10.0 if (gps_valid and accuracy_m is None) else 0.0)
    plot_score = 25.0 if plot_match else (5.0 if gps_valid else 0.0)
    time_score = 15.0 if capture_time_available else 0.0
    crop_score = 10.0 if crop_context_available else 0.0

    raw_context_score = gps_score + accuracy_score + plot_score + time_score + crop_score
    if not location_consistent:
        raw_context_score *= 0.7

    clamped_score = round(max(0.0, min(100.0, raw_context_score)))

    return {
        "score": clamped_score,
        "available": True,
        "gps_valid": gps_valid,
        "gps_accuracy_valid": gps_accuracy_valid,
        "plot_match": plot_match,
        "capture_time_available": capture_time_available,
        "crop_context_available": crop_context_available,
        "location_consistent": location_consistent,
        "weather": weather_info,
        "warnings": warnings,
        "details": {
            "capture_lat": lat,
            "capture_lon": lon,
            "capture_accuracy_m": accuracy_m,
            "plot_distance_meters": plot_dist,
            "gps_score": gps_score,
            "accuracy_score": accuracy_score,
            "plot_score": plot_score,
            "time_score": time_score,
            "crop_score": crop_score,
        },
    }
