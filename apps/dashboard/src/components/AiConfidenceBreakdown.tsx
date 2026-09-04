"use client";

import React from "react";
import { Submission } from "@/lib/api";
import { normalizePeril, routeForPeril } from "@/lib/claim-routing";

const ANGLE_LABELS: Record<string, string> = {
  photo_1: "Photo 1 (Field Overview)",
  photo_2: "Photo 2 (Crop Condition)",
  photo_3: "Photo 3 (Damage Detail)",
  wide_field: "Wide Field",
  left_context: "Left Context",
  mid_canopy: "Mid Canopy",
  right_context: "Right Context",
  closeup_damage: "Closeup Damage",
};

export interface AiConfidenceBreakdownProps {
  prediction: NonNullable<Submission["latest_prediction"]>;
  images?: Submission["images"];
  peril?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function AiConfidenceBreakdown({
  prediction,
  images = [],
  peril,
}: AiConfidenceBreakdownProps) {
  const explanation = asRecord(prediction.explanation);
  const authenticity = asRecord(explanation?.authenticity);
  const reasoning = String(explanation?.reasoning || "").trim();
  const visualFindings = String(explanation?.visual_findings || "").trim();
  const perImage = Array.isArray(explanation?.per_image) ? explanation.per_image : [];

  const confidence = prediction?.overall_confidence ?? 0;
  const isUnusable = (prediction?.predicted_grade || "U") === "U";
  const confidencePct = isUnusable ? 0 : Math.round(confidence * 100);
  const grade = prediction?.predicted_grade || "U";

  const gradeConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
    A: {
      label: "A — Healthy canopy signal",
      bg: "bg-[var(--accent-soft)]",
      text: "text-[var(--ink)]",
      border: "border-[var(--line)]",
    },
    B: {
      label: "B — Uncertain / needs a closer look",
      bg: "bg-[var(--surface)]",
      text: "text-[var(--ink)]",
      border: "border-[var(--ink)]",
    },
    C: {
      label: "C — Damage / disease pattern",
      bg: "bg-[var(--ink)]",
      text: "text-[var(--surface)]",
      border: "border-[var(--ink)]",
    },
    U: {
      label: "U — Unusable or not authentic",
      bg: "bg-[var(--canvas)]",
      text: "text-[var(--ink-muted)]",
      border: "border-[var(--line)]",
    },
  };
  const currentGradeStyle = gradeConfig[grade] || gradeConfig.U;

  const requiredAngles = routeForPeril(normalizePeril(peril)).requiredAngles;

  const safeImages = Array.isArray(images) ? images : [];
  const uploadedAngles = new Set(
    safeImages
      .filter((img) => img?.upload_status === "uploaded")
      .map((img) => img?.angle_type)
      .filter(Boolean),
  );

  const warnings = [
    ...(prediction?.quality_warnings || []),
    ...(prediction?.anomaly_flags || []),
  ].filter(Boolean);

  const authentic = authenticity?.authentic !== false && !isUnusable;
  const authReason = String(authenticity?.reason || (authentic ? "Looks like a real field photo" : "Failed authenticity checks"));

  // 2–3 line reviewer-facing verdict: accept / reject / unsure + why.
  const verdict = (() => {
    const damage = String(prediction?.primary_damage || "unknown").toLowerCase();
    const sev = String(prediction?.severity || "").toLowerCase();
    const area = typeof prediction?.affected_area_pct === "number" ? prediction.affected_area_pct : null;
    const hasDamageSignal = damage !== "unknown" && damage !== "healthy" && damage !== "none" && damage !== "";
    if (isUnusable || !authentic) {
      return {
        tone: "reject" as const,
        title: "AI recommends: Reject / recapture",
        body: `Evidence is ${!authentic ? "not authentic" : "unusable for grading"} (${authReason.slice(0, 110)}). No reliable damage signal can be scored from these frames — request a daylight recapture or reject with reason.`,
      };
    }
    if (grade === "A" && confidencePct >= 70) {
      return {
        tone: "accept" as const,
        title: "AI recommends: Accept as healthy",
        body: `Grade A at ${confidencePct}% confidence with no significant damage pattern${visualFindings ? " — canopy looks uniform across angles" : ""}. Safe to accept unless satellite or plot-mismatch flags say otherwise.`,
      };
    }
    if ((grade === "C" || hasDamageSignal) && confidencePct >= 60) {
      return {
        tone: "accept" as const,
        title: "AI recommends: Accept damage claim",
        body: `${damage.replaceAll("_", " ")}${sev ? ` · ${sev} severity` : ""}${area != null ? ` · ~${area}% area` : ""} at ${confidencePct}% confidence. Visible damage is consistent across submitted angles — verify severity % before payout.`,
      };
    }
    return {
      tone: "unsure" as const,
      title: "AI is unsure — needs human call",
      body: `Grade ${grade} at ${confidencePct}%${hasDamageSignal ? ` with a weak ${damage.replaceAll("_", " ")} signal` : ""}${warnings.length ? ` · flags: ${warnings.slice(0, 2).join(", ").replaceAll("_", " ")}` : ""}. Evidence is borderline — check coverage/GPS below, or request one targeted recapture.`,
    };
  })();

  const verdictStyle =
    verdict.tone === "accept"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
      : verdict.tone === "reject"
        ? "border-rose-300 bg-rose-50 text-rose-950"
        : "border-amber-300 bg-amber-50 text-amber-950";
  const verdictDot =
    verdict.tone === "accept" ? "bg-emerald-500" : verdict.tone === "reject" ? "bg-rose-500" : "bg-amber-500";

  return (
    <div className="space-y-2.5 rounded-lg border border-indigo-200 bg-white p-3 text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
              Gemini field analysis (assistive)
            </h4>
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-2xs">
              Primary AI signal
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            Model: <span className="font-mono">{prediction?.model_version || "gemini-3.8-flash"}</span>
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${currentGradeStyle.bg} ${currentGradeStyle.text} ${currentGradeStyle.border}`}
        >
          <span className="font-bold">{grade}</span>
          <span>·</span>
          <span>{currentGradeStyle.label}</span>
        </div>
      </div>

      <div className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed shadow-2xs ${verdictStyle}`}>
        <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${verdictDot}`} />
        <div>
          <div className="text-[13px] font-bold">{verdict.title}</div>
          <p className="mt-0.5">{verdict.body}</p>
        </div>
      </div>

      <div className={`rounded border p-2.5 text-xs ${authentic ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-rose-200 bg-rose-50 text-rose-950"}`}>
        <div className="font-semibold">{authentic ? "Authenticity: field photograph" : "Authenticity: rejected"}</div>
        <p className="mt-1 leading-relaxed">{authReason}</p>
        {authenticity && (
          <ul className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
            <li>Screen / 2nd display: {authenticity.screenReplay ? "YES" : "no"}</li>
            <li>AI-generated: {authenticity.aiGenerated ? "YES" : "no"}</li>
            <li>Printed photo: {authenticity.printedPhoto ? "YES" : "no"}</li>
            <li>Indoor / non-field: {authenticity.indoorScene ? "YES" : "no"}</li>
          </ul>
        )}
      </div>

      {visualFindings && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">What Gemini saw</div>
          <p className="mt-1 text-sm leading-relaxed text-slate-800">{visualFindings}</p>
        </div>
      )}

      {reasoning && (
        <div className="rounded border border-slate-100 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reviewer notes</div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{reasoning}</p>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-slate-700">
            {isUnusable ? "Unusable evidence" : "Analysis confidence"}
          </span>
          <span className="font-mono font-bold tabular-nums text-slate-900">{confidencePct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          <div
            className="h-full bg-[var(--ink)]"
            style={{ width: `${Math.min(Math.max(confidencePct, 0), 100)}%` }}
          />
        </div>
      </div>

      {perImage.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Per-angle findings</div>
          {perImage.map((item, idx) => {
            const row = asRecord(item);
            if (!row) return null;
            const angle = String(row.angleType || row.angle_type || `angle-${idx}`);
            return (
              <div key={`${angle}-${idx}`} className="rounded border border-slate-100 bg-white p-2 text-xs">
                <div className="font-semibold text-slate-800">
                  {ANGLE_LABELS[angle] || angle}
                  {row.usable === false ? " — unusable" : ""}
                </div>
                <p className="mt-0.5 text-slate-600">{String(row.findings || "")}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded border border-slate-100 bg-slate-50/70 p-3">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-700">
          <span>Uploaded angles</span>
          <span className="font-mono text-slate-600">
            {uploadedAngles.size} / {requiredAngles.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {requiredAngles.map((angle) => {
            const isUploaded = uploadedAngles.has(angle);
            return (
              <div
                key={angle}
                className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${
                  isUploaded
                    ? "border-[var(--ink)] bg-[var(--accent-soft)] text-[var(--ink)]"
                    : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]"
                }`}
              >
                <span>{isUploaded ? "✓" : "—"}</span>
                <span className="truncate">{ANGLE_LABELS[angle] ?? angle}</span>
              </div>
            );
          })}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <span className="font-semibold">Flags:</span>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-800">
            {warnings.map((w, idx) => (
              <li key={idx} className="capitalize">
                {String(w).replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
