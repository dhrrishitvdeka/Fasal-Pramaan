"use client";

import React, { useState } from "react";
import { Submission } from "@/lib/api";

const REQUIRED_ANGLES = [
  { key: "wide_field", label: "Wide Field" },
  { key: "left_context", label: "Left Context" },
  { key: "mid_canopy", label: "Mid Canopy" },
  { key: "right_context", label: "Right Context" },
  { key: "closeup_damage", label: "Closeup Damage" },
];

export interface AiConfidenceBreakdownProps {
  prediction: NonNullable<Submission["latest_prediction"]>;
  images?: Submission["images"];
}

export function AiConfidenceBreakdown({
  prediction,
  images = [],
}: AiConfidenceBreakdownProps) {
  const [showScores, setShowScores] = useState(false);

  const confidence = prediction?.overall_confidence ?? 0;
  const confidencePct = Math.round(confidence * 100);
  const isHighConfidence = confidence >= 0.7;
  const isModerateConfidence = confidence >= 0.55 && confidence < 0.7;

  // Grade badge styling & labels
  const grade = prediction?.predicted_grade || "U";
  const gradeConfig: Record<
    string,
    { label: string; bg: string; text: string; border: string }
  > = {
    A: {
      label: "A — Healthy Leaf Signal",
      bg: "bg-emerald-50",
      text: "text-emerald-800",
      border: "border-emerald-200",
    },
    B: {
      label: "B — Uncertain / Borderline",
      bg: "bg-amber-50",
      text: "text-amber-800",
      border: "border-amber-200",
    },
    C: {
      label: "C — Disease Pattern Signal",
      bg: "bg-rose-50",
      text: "text-rose-800",
      border: "border-rose-200",
    },
    U: {
      label: "U — Unusable or Unsupported",
      bg: "bg-slate-100",
      text: "text-slate-700",
      border: "border-slate-300",
    },
  };

  const currentGradeStyle = gradeConfig[grade] || gradeConfig.U;

  // Angle coverage calculation (safe against missing or undefined images array)
  const safeImages = Array.isArray(images) ? images : [];
  const uploadedAngles = new Set(
    safeImages
      .filter((img) => img?.upload_status === "uploaded")
      .map((img) => img?.angle_type)
      .filter(Boolean)
  );

  const angleCount = REQUIRED_ANGLES.filter((a) =>
    uploadedAngles.has(a.key)
  ).length;
  const anglePct = Math.round((angleCount / REQUIRED_ANGLES.length) * 100);

  const warnings = [
    ...(prediction?.quality_warnings || []),
    ...(prediction?.anomaly_flags || []),
  ].filter(Boolean);

  return (
    <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
      {/* Header with Title & Grade */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            AI Screening Analysis & Confidence
          </h4>
          <p className="mt-0.5 text-xs text-slate-600">
            Model: <span className="font-mono">{prediction?.adapter_type || "crop_vit"}</span> ({prediction?.model_version || "v1.0"})
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

      {/* Confidence Meter Bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-medium text-slate-700">Overall Confidence</span>
          <span className="font-mono font-bold tabular-nums text-slate-900">
            {confidencePct}%
          </span>
        </div>
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200">
          <div
            className={`h-full transition-all duration-300 ${
              isHighConfidence
                ? "bg-emerald-500"
                : isModerateConfidence
                ? "bg-amber-500"
                : "bg-rose-500"
            }`}
            style={{ width: `${Math.min(Math.max(confidencePct, 0), 100)}%` }}
          />
          {/* Threshold indicator mark at 55% */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-slate-400 opacity-60"
            style={{ left: "55%" }}
            title="Abstention threshold (55%)"
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>0%</span>
          <span className="text-slate-400 font-mono text-[10px]">
            Threshold: 55%
          </span>
          <span>100%</span>
        </div>
      </div>

      {/* Angle Quality & Coverage Checklist */}
      <div className="rounded border border-slate-100 bg-slate-50/70 p-3">
        <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
          <span>Evidence Angle Coverage</span>
          <span className="font-mono text-slate-600">
            {angleCount} / {REQUIRED_ANGLES.length} ({anglePct}%)
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {REQUIRED_ANGLES.map((angle) => {
            const isUploaded = uploadedAngles.has(angle.key);
            return (
              <div
                key={angle.key}
                className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] border ${
                  isUploaded
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <span className="text-xs">{isUploaded ? "✓" : "⚠️"}</span>
                <span className="truncate">{angle.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warnings & Anomaly Alerts */}
      {warnings.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <span className="font-semibold">Quality Flags & Warnings:</span>
          <ul className="mt-1 list-disc list-inside space-y-0.5 text-amber-800">
            {warnings.map((w, idx) => (
              <li key={idx} className="capitalize">
                {String(w).replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Optional Score Distributions Accordion */}
      {(prediction?.grade_scores || prediction?.damage_scores) && (
        <div className="pt-1">
          <button
            type="button"
            className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900 font-medium"
            onClick={() => setShowScores(!showScores)}
          >
            {showScores ? "▼ Hide score breakdown" : "► Show detailed score breakdown"}
          </button>
          {showScores && (
            <div className="mt-2 space-y-2 rounded border border-slate-200 bg-slate-50 p-2.5 text-xs">
              {prediction.grade_scores && (
                <div>
                  <span className="font-semibold text-slate-700">Grade Probabilities:</span>
                  <div className="mt-1 grid grid-cols-4 gap-2">
                    {Object.entries(prediction.grade_scores).map(([k, v]) => {
                      const numVal = Number(v);
                      const displayPct = isNaN(numVal) ? "0.0" : (numVal * 100).toFixed(1);
                      return (
                        <div key={k} className="rounded bg-white p-1 text-center border border-slate-200">
                          <span className="font-bold text-slate-800">{k}: </span>
                          <span className="font-mono text-slate-600">{displayPct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {prediction.damage_scores && (
                <div>
                  <span className="font-semibold text-slate-700">Top Damage Probabilities:</span>
                  <div className="mt-1 space-y-1">
                    {Object.entries(prediction.damage_scores)
                      .sort(([, a], [, b]) => (Number(b) || 0) - (Number(a) || 0))
                      .slice(0, 4)
                      .map(([damage, score]) => {
                        const numScore = Number(score);
                        const displayPct = isNaN(numScore) ? "0.0" : (numScore * 100).toFixed(1);
                        return (
                          <div key={damage} className="flex items-center justify-between text-slate-600">
                            <span className="capitalize">{damage.replaceAll("_", " ")}</span>
                            <span className="font-mono font-medium">{displayPct}%</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
