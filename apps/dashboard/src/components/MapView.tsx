"use client";

import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MapMarker } from "@/lib/api";
import { OSM_TILE_ATTRIBUTION, OSM_TILE_URL } from "@/lib/map-tiles";
import { useEffect } from "react";
import Link from "next/link";

function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = markers.filter(
      (m) => typeof m.lat === "number" && typeof m.lon === "number" && !isNaN(m.lat) && !isNaN(m.lon),
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

/** Monochrome severity scale suitable for print / official screens. */
function severityColor(severity?: string | null, status?: string) {
  if (status === "needs_recapture") return "#94a3b8";
  switch ((severity || "").toLowerCase()) {
    case "high":
    case "severe":
    case "critical":
      return "#0f172a";
    case "medium":
      return "#475569";
    case "low":
      return "#64748b";
    case "none":
      return "#94a3b8";
    default:
      return "#64748b";
  }
}

export default function MapView({ markers }: { markers: MapMarker[] }) {
  const validMarkers = markers.filter(
    (m) => typeof m.lat === "number" && typeof m.lon === "number" && !isNaN(m.lat) && !isNaN(m.lon),
  );
  const center: [number, number] =
    validMarkers.length > 0 ? [validMarkers[0].lat, validMarkers[0].lon] : [23.26, 77.41];

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
