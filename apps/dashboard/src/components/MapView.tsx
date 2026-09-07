"use client";

import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MapMarker } from "@/lib/api";
import { OSM_TILE_ATTRIBUTION, OSM_TILE_URL } from "@/lib/map-tiles";
import { useEffect } from "react";
import Link from "next/link";

import { MapPin } from "lucide-react";
import { isValidCoordinate } from "@/lib/context/assemble";

function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = markers.filter(
      (m) => isValidCoordinate(m.lat, m.lon),
    );
    if (valid.length === 0) return;
    const lats = valid.map((m) => m.lat);
    const lons = valid.map((m) => m.lon);
    map.fitBounds(
      [
        [Math.min(...lats) - 0.01, Math.min(...lons) - 0.01],
        [Math.max(...lats) + 0.01, Math.max(...lons) + 0.01],
      ],
      { padding: [40, 40] }
    );
  }, [markers, map]);
  return null;
}

/**
 * Colorblind-safe status/severity scale (Okabe–Ito inspired). Every state has
 * a distinct hue AND the popup carries a text label, so color is never the
 * only signal. In particular needs_recapture (amber) no longer collides with
 * none/U (grey).
 */
function severityColor(severity?: string | null, status?: string) {
  if (status === "needs_recapture") return "#e69f00";
  if (status === "verified") return "#009e73";
  if (status === "rejected") return "#cc79a7";
  switch ((severity || "").toLowerCase()) {
    case "high":
    case "severe":
    case "critical":
    case "c":
      return "#d55e00";
    case "medium":
    case "b":
      return "#e69f00";
    case "low":
    case "a":
      return "#56b4e9";
    case "none":
    case "u":
      return "#999999";
    default:
      return "#0072b2";
  }
}

export default function MapView({ markers }: { markers: MapMarker[] }) {
  const validMarkers = markers.filter(
    (m) => isValidCoordinate(m.lat, m.lon),
  );

  if (validMarkers.length === 0) {
    return (
      <div className="flex h-[min(58vh,380px)] w-full flex-col items-center justify-center border border-slate-200 bg-slate-50 p-6 text-center md:h-[520px]">
        <MapPin className="mb-2 h-10 w-10 text-slate-400" />
        <h3 className="text-sm font-bold text-slate-800">No Geotagged Claims Available</h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          None of the claims currently have valid GPS coordinates recorded. Ensure location permissions are active during field capture.
        </p>
      </div>
    );
  }

  const center: [number, number] = [validMarkers[0].lat, validMarkers[0].lon];

  return (
    <div className="h-[min(58vh,380px)] w-full overflow-hidden border border-slate-200 bg-white md:h-[520px]">
      <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom>
        <TileLayer attribution={OSM_TILE_ATTRIBUTION} url={OSM_TILE_URL} />
        <FitBounds markers={validMarkers} />
        {validMarkers.map((m) => (
          <CircleMarker
            key={m.id}
            center={[m.lat, m.lon]}
            radius={8}
            pathOptions={{
              color: severityColor(m.severity, m.status),
              fillColor: severityColor(m.severity, m.status),
              fillOpacity: 0.85,
              weight: 1,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm text-slate-800">
                <div>
                  <span className="text-slate-500">Status:</span> {m.status}
                </div>
                <div>
                  <span className="text-slate-500">Severity:</span> {m.severity || "—"}
                </div>
                <div>
                  <span className="text-slate-500">Damage:</span> {m.primary_damage || "—"}
                </div>
                <div>
                  <span className="text-slate-500">Crop:</span> {m.crop_code || "—"}
                </div>
                <Link
                  className="inline-block pt-1 font-medium text-slate-900 underline underline-offset-2"
                  href={`/review/${m.id}`}
                >
                  Open case
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
