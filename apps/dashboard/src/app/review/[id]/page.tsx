"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Submission } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState("");
  const [damage, setDamage] = useState("");
  const [affectedArea, setAffectedArea] = useState("");
  const [crop, setCrop] = useState("");
  const [growthStage, setGrowthStage] = useState("");
  const [grade, setGrade] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["submission", id],
    queryFn: async () => (await api.get<Submission>(`/review/${id}`)).data,
  });

  const { data: history } = useQuery({
    queryKey: ["review-history", id],
    queryFn: async () => (await api.get(`/review/${id}/history`)).data,
  });

  const action = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post(`/review/${id}/action`, payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submission", id] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["review-history", id] });
      setMessage("Decision recorded. Audit trail updated.");
    },
    onError: (err: unknown) => {
      const msg =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.detail || "Action failed";
      setMessage(String(msg));
    },
  });

  if (isLoading || !data) {
    return <p className="text-sm text-slate-500">Loading case…</p>;
  }
  const pred = data.latest_prediction;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <button
        type="button"
        className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
        onClick={() => router.push("/review")}
      >
        ← Return to queue
      </button>

      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Case review</h2>
        <p className="mt-1 font-mono text-xs text-slate-500">{data.id}</p>
      </div>

      {message && (
        <div
          className="border border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          role="status"
        >
          {message}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <section className="fp-panel space-y-2 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Evidence & location
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">Status</dt>
            <dd>
              <span className="fp-badge-neutral">{data.status}</span>
            </dd>
            <dt className="text-slate-500">GPS</dt>
            <dd className="tabular-nums">
              {data.capture_lat?.toFixed(5)}, {data.capture_lon?.toFixed(5)} (±
              {data.capture_accuracy_m ?? "?"} m)
            </dd>
            <dt className="text-slate-500">Notes</dt>
            <dd className="text-slate-700">{data.farmer_observations || "—"}</dd>
          </dl>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {data.images.map((img) => (
              <div key={img.id} className="border border-slate-200 p-2 text-xs">
                <div className="font-medium text-slate-800">{img.angle_type}</div>
                <div className="text-slate-500">{img.upload_status}</div>
                {img.download_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.download_url}
                    alt={img.angle_type}
                    className="mt-1 max-h-24 w-full object-cover"
                  />
                ) : (
                  <div className="mt-1 flex h-16 items-center justify-center bg-slate-100 text-slate-400">
                    No preview
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="fp-panel space-y-2 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            AI findings
          </h3>
          {pred ? (
            <>
              <p className="border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                Model {pred.model_version} ({pred.adapter_type}) · production validated:{" "}
                <strong>{pred.is_production_validated ? "yes" : "no"}</strong>
                {pred.promotion_status && <> · {pred.promotion_status.replaceAll("_", " ")}</>}
                {pred.adapter_type === "crop_health_v3" && !pred.promotion_status && (
                  <> · promotion gates not passed</>
                )}
                {!pred.is_production_validated && " — non-production; human decision required"}
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-slate-500">Crop</dt>
                <dd>
                  {pred.predicted_crop || "—"} ({((pred.crop_confidence || 0) * 100).toFixed(0)}%)
                </dd>
                <dt className="text-slate-500">Stage</dt>
                <dd>{pred.predicted_growth_stage || "—"}</dd>
                <dt className="text-slate-500">Health screening grade</dt>
                <dd>
                  <span className="fp-badge-neutral">{pred.predicted_grade || "—"}</span>{" "}
                  {pred.grade_label?.replaceAll("_", " ") || ""}
                  {pred.grade_confidence != null
                    ? ` (${(pred.grade_confidence * 100).toFixed(0)}%)`
                    : ""}
                </dd>
                <dt className="text-slate-500">Primary damage</dt>
                <dd>{pred.primary_damage}</dd>
                <dt className="text-slate-500">Severity</dt>
                <dd>{pred.severity || "—"}</dd>
                <dt className="text-slate-500">Affected area</dt>
                <dd>{pred.affected_area_pct == null ? "—" : `${pred.affected_area_pct}%`}</dd>
                <dt className="text-slate-500">Confidence</dt>
                <dd className="tabular-nums">{((pred.overall_confidence || 0) * 100).toFixed(0)}%</dd>
                <dt className="text-slate-500">Recommendation</dt>
                <dd>{pred.human_review_recommendation}</dd>
              </dl>
              {(pred.quality_warnings || []).length > 0 && (
                <p className="text-xs text-slate-700">
                  Warnings: {(pred.quality_warnings || []).join(", ")}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">No AI prediction yet</p>
          )}
        </section>
      </div>

      <section className="fp-panel space-y-3 p-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Reviewer decision
        </h3>
        <label className="block text-xs font-medium text-slate-700">
          Damage category
          <select className="fp-input" value={damage} onChange={(e) => setDamage(e.target.value)}>
            <option value="">Keep AI category</option>
            {[
              "healthy", "lodging", "flood", "waterlogging", "drought_stress", "pest",
              "disease", "hail_storm", "fire", "nutrient_deficiency", "weed_pressure",
            ].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Corrected health screening grade
          <select className="fp-input" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">Keep AI screening grade</option>
            <option value="A">A — healthy leaf signal</option>
            <option value="B">B — uncertain; manual review</option>
            <option value="C">C — disease pattern signal</option>
            <option value="U">U — unusable or unsupported</option>
          </select>
        </label>
        <p className="text-xs text-slate-500">
          Screening grade is not crop-loss severity, produce quality, or claim eligibility.
        </p>
        <label className="block text-xs font-medium text-slate-700">
          Corrected severity
          <select
            className="fp-input"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">Keep AI severity</option>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Affected area (%)
          <input className="fp-input" type="number" min="0" max="100" step="0.1" value={affectedArea} onChange={(e) => setAffectedArea(e.target.value)} />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Corrected crop (optional)
            <input className="fp-input" value={crop} onChange={(e) => setCrop(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Corrected growth stage (optional)
            <input className="fp-input" value={growthStage} onChange={(e) => setGrowthStage(e.target.value)} />
          </label>
        </div>
        <label className="block text-xs font-medium text-slate-700">
          Override reason (required when correcting)
          <textarea
            className="fp-input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Notes
          <textarea
            className="fp-input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="fp-btn-primary"
            disabled={action.isPending || !pred || !pred.primary_damage || !pred.severity || pred.affected_area_pct == null}
            onClick={() => action.mutate({ action: "accept", notes })}
          >
            Accept AI result
          </button>
          <button
            type="button"
            className="fp-btn-secondary"
            disabled={action.isPending}
            onClick={() =>
              action.mutate({
                action: "correct",
                override_reason: reason,
                corrected_severity: severity || undefined,
                corrected_damage_codes: damage ? [damage] : undefined,
                corrected_affected_area_pct: affectedArea === "" ? undefined : Number(affectedArea),
                corrected_crop: crop || undefined,
                corrected_growth_stage: growthStage || undefined,
                corrected_grade: grade || undefined,
                notes,
              })
            }
          >
            Correct & verify
          </button>
          <button
            type="button"
            className="fp-btn-secondary"
            disabled={action.isPending}
            onClick={() =>
              action.mutate({
                action: "request_recapture",
                override_reason: reason || notes || "Image quality insufficient",
                notes,
              })
            }
          >
            Request recapture
          </button>
          <button
            type="button"
            className="fp-btn-danger"
            disabled={action.isPending}
            onClick={() =>
              action.mutate({
                action: "physical_inspection",
                override_reason: reason || notes || "Requires field verification",
                notes,
              })
            }
          >
            Physical inspection
          </button>
        </div>
      </section>

      <section className="fp-panel p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Audit & review history
        </h3>
        <pre className="max-h-64 overflow-auto border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
          {JSON.stringify(history || {}, null, 2)}
        </pre>
      </section>
    </div>
  );
}
