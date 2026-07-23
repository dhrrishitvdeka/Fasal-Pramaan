"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { api, MapMarker } from "@/lib/api";
import { useState } from "react";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MapPage() {
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [crop, setCrop] = useState("");
  const [damage, setDamage] = useState("");
  const [district, setDistrict] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["map", status, severity, crop, damage, district, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      if (severity) params.severity = severity;
      if (crop) params.crop = crop;
      if (damage) params.damage = damage;
      if (district) params.district = district;
      if (dateFrom) params.date_from = new Date(`${dateFrom}T00:00:00`).toISOString();
      if (dateTo) params.date_to = new Date(`${dateTo}T23:59:59`).toISOString();
      return (await api.get<MapMarker[]>("/dashboard/map/markers", { params })).data;
    },
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="fp-page-title">Submissions map</h2>
          <p className="fp-page-sub">
            Geographic distribution · OpenStreetMap · farmer PII not displayed
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs text-slate-600">
            Status
            <select
              className="ml-2 border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="pending_review">Pending review</option>
              <option value="verified">Verified</option>
              <option value="needs_recapture">Needs recapture</option>
              <option value="physical_inspection">Physical inspection</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Severity
            <select
              className="ml-2 border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">All</option>
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Crop
            <select className="ml-2 border border-slate-300 bg-white px-2 py-1.5 text-sm" value={crop} onChange={(e) => setCrop(e.target.value)}>
              <option value="">All</option>
              <option value="paddy">Paddy</option>
              <option value="wheat">Wheat</option>
              <option value="soybean">Soybean</option>
              <option value="cotton">Cotton</option>
              <option value="maize">Maize</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Damage
            <select className="ml-2 border border-slate-300 bg-white px-2 py-1.5 text-sm" value={damage} onChange={(e) => setDamage(e.target.value)}>
              <option value="">All</option>
              <option value="healthy">Healthy</option>
              <option value="disease">Disease</option>
              <option value="pest">Pest</option>
              <option value="flood">Flood</option>
              <option value="lodging">Lodging</option>
              <option value="waterlogging">Waterlogging</option>
              <option value="drought_stress">Water stress</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            District
            <input className="ml-2 w-36 border border-slate-300 px-2 py-1.5 text-sm" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Name or code" />
          </label>
          <label className="text-xs text-slate-600">
            From
            <input type="date" className="ml-2 border border-slate-300 px-2 py-1.5 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600">
            To
            <input type="date" className="ml-2 border border-slate-300 px-2 py-1.5 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading map…</p>
      ) : (
        <MapView markers={data} />
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span>{data.length} markers</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-900" /> High
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-600" /> Medium
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-400" /> Low / other
        </span>
      </div>
    </div>
  );
}
