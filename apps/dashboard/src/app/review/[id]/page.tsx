"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Submission } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";

import { AiConfidenceBreakdown } from "@/components/AiConfidenceBreakdown";
import { ReviewKeyboardShortcuts } from "@/components/ReviewKeyboardShortcuts";
import { EvidenceConfidenceSection, resolveEvidenceEvaluation } from "@/components/EvidenceConfidenceSection";

const ALL_ANGLES = [
  { key: "wide_field", label: "Wide Field" },
  { key: "left_context", label: "Left Context" },
  { key: "mid_canopy", label: "Mid Canopy" },
  { key: "right_context", label: "Right Context" },
  { key: "closeup_damage", label: "Closeup Damage" },
];

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

  // Specific adaptive recapture angle selection
  const [selectedAngles, setSelectedAngles] = useState<string[]>([]);
  const [recaptureModalOpen, setRecaptureModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["submission", id],
    queryFn: async () => (await api.get<Submission>(`/review/${id}`)).data,
  });

  const { data: history } = useQuery({
    queryKey: ["review-history", id],
    queryFn: async () => (await api.get(`/review/${id}/history`)).data,
  });

  // Resolve evidence evaluation & safety
  const evaluation = useMemo(() => {
    return data ? resolveEvidenceEvaluation(data) : null;
  }, [data]);

  // Determine if integrity checks have failed
  const integrityFailed = useMemo(() => {
    if (!evaluation) return false;
    const iScore = evaluation.integrity?.score ?? 100;
    const iDetails = evaluation.integrity?.details;
    return (
      iScore < 50 ||
      evaluation.uncertainty?.type === "integrity" ||
      iDetails?.tamper_check_passed === false ||
      iDetails?.duplicate_detected === true ||
      iDetails?.is_mock_location === true
    );
  }, [evaluation]);

  // Auto-fill suggested recapture angles from evaluation
  const suggestedAngles = useMemo(() => {
    if (!evaluation) return ["closeup_damage"];
    if (evaluation.request?.required_angles && evaluation.request.required_angles.length > 0) {
      return evaluation.request.required_angles;
    }
    const missing = evaluation.coverage?.details?.missing_views;
    if (Array.isArray(missing) && missing.length > 0) {
      return missing;
    }
    return ["closeup_damage"];
  }, [evaluation]);

  const action = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post(`/review/${id}/action`, payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submission", id] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["review-history", id] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["map-markers"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      setMessage("Decision recorded. Audit trail and metrics updated.");
      setRecaptureModalOpen(false);
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

  // SAFETY: Disallow accepting AI result if mandatory integrity condition fails or prediction is missing
  const canAccept = Boolean(
    pred &&
      !integrityFailed &&
      (pred.predicted_grade ||
        (pred.primary_damage &&
          pred.primary_damage !== "unknown" &&
          pred.severity &&
          pred.affected_area_pct != null))
  );

  const handleAccept = () => {
    if (canAccept) {
      action.mutate({ action: "accept", notes });
    }
  };

  const handleCorrect = () => {
    action.mutate({
      action: "correct",
      override_reason: reason || notes || "Human recorded screening decision",
      corrected_severity: severity || undefined,
      corrected_damage_codes: damage ? [damage] : undefined,
      corrected_affected_area_pct: affectedArea === "" ? undefined : Number(affectedArea),
      corrected_crop: crop || undefined,
      corrected_growth_stage: growthStage || undefined,
      corrected_grade: grade || undefined,
      notes,
    });
  };

  const handleOpenRecapture = () => {
    if (selectedAngles.length === 0) {
      setSelectedAngles(suggestedAngles);
    }
    setRecaptureModalOpen(true);
  };

  const handleConfirmRecapture = () => {
    const anglesToRequest = selectedAngles.length > 0 ? selectedAngles : suggestedAngles;
    action.mutate({
      action: "request_recapture",
      override_reason:
        reason ||
        notes ||
        `Recapture requested for angles: ${anglesToRequest.join(", ")}. Reason: ${
          evaluation?.uncertainty?.reasons?.[0] || "Evidence quality or coverage insufficient"
        }`,
      notes: notes || `Requested angles: ${anglesToRequest.join(", ")}`,
      required_angles: anglesToRequest,
    });
  };

  const handleInspection = () => {
    action.mutate({
      action: "physical_inspection",
      override_reason: reason || notes || "Requires field verification",
      notes,
    });
  };

  const toggleAngle = (key: string) => {
    setSelectedAngles((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
          onClick={() => router.push("/review")}
        >
          ← Return to queue
        </button>
        <ReviewKeyboardShortcuts
          disabled={action.isPending || recaptureModalOpen}
          onAccept={handleAccept}
          onCorrect={handleCorrect}
          onRequestRecapture={handleOpenRecapture}
          onPhysicalInspection={handleInspection}
          onReturnToQueue={() => router.push("/review")}
        />
      </div>

      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Case Review & Evidence Assessment</h2>
        <p className="mt-1 font-mono text-xs text-slate-500">Case ID: {data.id}</p>
      </div>

      {message && (
        <div
          className="border border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          role="status"
        >
          {message}
        </div>
      )}

      {/* 1. Evidence Confidence & Trust Assessment Section */}
      <EvidenceConfidenceSection submission={data} />

      {/* 2. Physical Evidence & Geolocation */}
      <section className="fp-panel space-y-2 p-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Physical Evidence & Geotags
          </h3>
          <span className="fp-badge-neutral">{data.status}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm pt-1">
          <dt className="text-slate-500">GPS Coordinates</dt>
          <dd className="tabular-nums font-mono text-xs">
            {data.capture_lat?.toFixed(5)}, {data.capture_lon?.toFixed(5)} (±
            {data.capture_accuracy_m ?? "?"} m)
          </dd>
          <dt className="text-slate-500">Farmer Notes</dt>
          <dd className="text-slate-700">{data.farmer_observations || "—"}</dd>
        </dl>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {(data.images || []).map((img) => (
            <div key={img.id} className="border border-slate-200 p-2 text-xs rounded bg-white">
              <div className="font-semibold text-slate-800 truncate capitalize">{img.angle_type.replaceAll("_", " ")}</div>
              <div className="text-[11px] text-slate-500">{img.upload_status}</div>
              {img.download_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.download_url}
                  alt={img.angle_type}
                  className="mt-1.5 h-24 w-full object-cover rounded border border-slate-100"
                />
              ) : (
                <div className="mt-1.5 flex h-24 items-center justify-center bg-slate-100 text-slate-400 rounded text-[11px]">
                  No preview
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3: AI Model Prediction & Screening (Explicitly Distinct from Evidence Confidence) */}
      <section className="fp-panel space-y-3 p-4 border-l-4 border-l-blue-500">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
              AI Model Prediction & Screening (Assistive Only)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Model inference findings · Does not equal evidence confidence
            </p>
          </div>
          {pred && (
            <span className="font-mono text-[11px] text-slate-500">
              Model: {pred.adapter_type} ({pred.model_version})
            </span>
          )}
        </div>

        {pred ? (
          <>
            <AiConfidenceBreakdown prediction={pred} images={data.images} />
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 text-xs pt-2 border-t border-slate-100">
              <div>
                <dt className="text-slate-500">Predicted Crop</dt>
                <dd className="font-semibold text-slate-800">
                  {pred.predicted_crop || "—"} ({((pred.crop_confidence || 0) * 100).toFixed(0)}%)
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Growth Stage</dt>
                <dd className="font-semibold text-slate-800">{pred.predicted_growth_stage || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Primary Damage</dt>
                <dd className="font-semibold text-slate-800 capitalize">{pred.primary_damage?.replaceAll("_", " ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Damage Severity</dt>
                <dd className="font-semibold text-slate-800 capitalize">{pred.severity || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Affected Area</dt>
                <dd className="font-semibold text-slate-800">{pred.affected_area_pct == null ? "—" : `${pred.affected_area_pct}%`}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Screening Grade</dt>
                <dd className="font-semibold text-slate-800">{pred.predicted_grade || "—"} ({pred.grade_label || "Grade"})</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">AI Recommendation</dt>
                <dd className="font-semibold text-slate-800">{pred.human_review_recommendation || "Manual review"}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-sm text-slate-500">No AI prediction available yet.</p>
        )}
      </section>

      {/* SECTION 4: Reviewer Decision & Action Controls */}
      <section className="fp-panel space-y-3 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Reviewer Decision & Verification
        </h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Damage Category Override
            <select className="fp-input mt-1" value={damage} onChange={(e) => setDamage(e.target.value)}>
              <option value="">Keep AI category ({pred?.primary_damage || "None"})</option>
              {[
                "healthy", "lodging", "flood", "waterlogging", "drought_stress", "pest",
                "disease", "hail_storm", "fire", "nutrient_deficiency", "weed_pressure",
              ].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>

          <label className="block text-xs font-medium text-slate-700">
            Corrected Health Screening Grade
            <select className="fp-input mt-1" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Keep AI screening grade ({pred?.predicted_grade || "U"})</option>
              <option value="A">A — healthy leaf signal</option>
              <option value="B">B — uncertain; manual review</option>
              <option value="C">C — disease pattern signal</option>
              <option value="U">U — unusable or unsupported</option>
            </select>
          </label>
        </div>

        <p className="text-[11px] text-slate-500">
          Screening grade is an assistive leaf health indicator, distinct from insurance crop-loss severity or claim eligibility.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Corrected Loss Severity
            <select
              className="fp-input mt-1"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">Keep AI severity ({pred?.severity || "Unset"})</option>
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          <label className="block text-xs font-medium text-slate-700">
            Affected Area (%)
            <input
              className="fp-input mt-1"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={affectedArea}
              onChange={(e) => setAffectedArea(e.target.value)}
              placeholder={pred?.affected_area_pct != null ? `${pred.affected_area_pct}%` : "0.0"}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Corrected Crop (Optional)
            <input className="fp-input mt-1" value={crop} onChange={(e) => setCrop(e.target.value)} placeholder={pred?.predicted_crop || ""} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Corrected Growth Stage (Optional)
            <input className="fp-input mt-1" value={growthStage} onChange={(e) => setGrowthStage(e.target.value)} placeholder={pred?.predicted_growth_stage || ""} />
          </label>
        </div>

        <label className="block text-xs font-medium text-slate-700">
          Override Reason (Required when correcting or requesting recapture)
          <textarea
            className="fp-input mt-1"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why the AI assessment or evidence was overridden or flagged..."
          />
        </label>

        <label className="block text-xs font-medium text-slate-700">
          Reviewer Notes
          <textarea
            className="fp-input mt-1"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes for audit trail..."
          />
        </label>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            className="fp-btn-primary flex items-center gap-1.5"
            disabled={action.isPending || !canAccept}
            onClick={handleAccept}
            title={integrityFailed ? "Acceptance disabled due to failed integrity checks" : "Accept AI result (A)"}
          >
            <span>Accept AI result</span>
            <kbd className="rounded bg-emerald-700 px-1 font-mono text-[10px] text-white">A</kbd>
          </button>

          <button
            type="button"
            className="fp-btn-secondary flex items-center gap-1.5"
            disabled={action.isPending}
            onClick={handleCorrect}
          >
            <span>Correct & verify</span>
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10px] text-slate-600">C</kbd>
          </button>

          <button
            type="button"
            className="fp-btn-secondary flex items-center gap-1.5"
            disabled={action.isPending}
            onClick={handleOpenRecapture}
          >
            <span>Request specific recapture…</span>
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10px] text-slate-600">R</kbd>
          </button>

          <button
            type="button"
            className="fp-btn-danger flex items-center gap-1.5"
            disabled={action.isPending}
            onClick={handleInspection}
          >
            <span>Physical inspection</span>
            <kbd className="rounded bg-rose-700 px-1 font-mono text-[10px] text-white">P</kbd>
          </button>
        </div>
      </section>

      {/* Adaptive Recapture Dialog / Modal */}
      {recaptureModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recapture-dialog-title"
        >
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 id="recapture-dialog-title" className="text-sm font-bold text-slate-900">
                Adaptive Evidence Recapture Request
              </h3>
              <button
                type="button"
                onClick={() => setRecaptureModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Select only the specific angles needed to resolve evidence uncertainty. The farmer will be guided to capture only these selected frames instead of re-doing all 5.
            </p>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-700 block">Required Angles to Request:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_ANGLES.map((angle) => {
                  const isChecked = selectedAngles.includes(angle.key);
                  const isSuggested = suggestedAngles.includes(angle.key);
                  return (
                    <label
                      key={angle.key}
                      className={`flex items-center gap-2 rounded border p-2 text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? "border-emerald-500 bg-emerald-50 text-emerald-900 font-medium"
                          : "border-slate-200 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAngle(angle.key)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{angle.label}</span>
                      {isSuggested && (
                        <span className="ml-auto rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800">
                          Recommended
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="block text-xs font-medium text-slate-700">
              Farmer Instruction / Reason:
              <input
                className="fp-input mt-1"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Please capture a clear close-up damage photo with good lighting."
              />
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                className="fp-btn-secondary"
                onClick={() => setRecaptureModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fp-btn-primary"
                disabled={action.isPending || selectedAngles.length === 0}
                onClick={handleConfirmRecapture}
              >
                {action.isPending ? "Sending…" : `Request ${selectedAngles.length} Angle(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: Audit & Review History */}
      <section className="fp-panel p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Audit & Review History
        </h3>
        <pre className="max-h-64 overflow-auto border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
          {JSON.stringify(history || {}, null, 2)}
        </pre>
      </section>
    </div>
  );
}

