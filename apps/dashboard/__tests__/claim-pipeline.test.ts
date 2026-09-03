import { describe, expect, it } from "vitest";
import {
  applyReviewerAction,
  attachHfPrediction,
  buildRecaptureSubmitInput,
  computeEvidencePreview,
  createMemoryClaimStore,
  getReviewerClaim,
  listReviewerQueue,
  persistAndInfer,
  persistFarmerSubmission,
  recaptureAndInfer,
  retryPendingInference,
  safeStorageSegment,
  sanitizeHfPrediction,
  type PersistedImageInput,
} from "../src/lib/claim-pipeline";
import { inferCropDisease, parseGeminiAnalysis } from "../src/lib/gemini-analyze";
import { predictionIsAcceptable } from "../src/lib/review-accept";
import { resolveClaimClientPath } from "../src/lib/claim-routes";

function jpegLikeBytes(): Uint8Array {
  const bytes = new Uint8Array(8192);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
  return bytes;
}

function usableImage(overrides: Partial<PersistedImageInput> = {}): PersistedImageInput {
  return {
    angleType: "closeup_damage",
    bytes: jpegLikeBytes(),
    sha256: "b".repeat(64),
    lightingScore: 50,
    luma: 50,
    cropScore: 80,
    blurScore: 40,
    greenPct: 40,
    qualityPassed: true,
    ...overrides,
  };
}

const geminiSuccess = {
  predicted_crop: "wheat",
  crop_confidence: 0.88,
  predicted_grade: "C",
  grade_label: "disease_pattern_signal",
  plant_disease_class: "wheat__disease",
  label: "wheat__disease",
  score: 0.81,
  primary_damage: "disease",
  severity: null,
  affected_area_pct: null,
  overall_confidence: 0.81,
  reasoning: "Close-up shows yellow pustules on a wheat flag leaf consistent with rust.",
  visual_findings: "Wheat canopy with foliar rust pustules.",
  authenticity: {
    authentic: true,
    screen_replay: false,
    ai_generated: false,
    printed_photo: false,
    indoor_scene: false,
    reason: "Outdoor field photograph",
  },
  per_image: [
    {
      angle_type: "closeup_damage",
      usable: true,
      crop: "wheat",
      damage_visible: true,
      findings: "Yellow pustules on flag leaf",
    },
  ],
  human_review_recommendation: "human_review",
};

function geminiFetchImpl(payload: unknown = geminiSuccess): typeof fetch {
  return async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

describe("claim persist + Fasal-Pramaan Space + reviewer queue", () => {
  it("computes coverage from real captured angles without inventing quality", () => {
    const preview = computeEvidencePreview([
      { angleType: "wide_field", bytes: jpegLikeBytes(), sha256: "a".repeat(64) },
      { angleType: "closeup_damage", bytes: jpegLikeBytes() },
    ]);
    expect(preview.coverageScore).toBe(40);
    expect(preview.qualityScore).toBe(0);
    expect(preview.integrityScore).toBe(50);
    expect(preview.missingAngles).toEqual(["left_context", "mid_canopy", "right_context"]);
  });

  it("parses Gemini analysis JSON and rejects empty payloads", () => {
    const parsed = parseGeminiAnalysis(geminiSuccess);
    expect(parsed.predictedGrade).toBe("C");
    expect(parsed.plantDiseaseClass).toBe("wheat__disease");
    expect(parsed.score).toBe(0.81);
    expect(parsed.reasoning).toMatch(/pustules/i);
    expect(() => parseGeminiAnalysis({})).toThrow(/class or grade/i);
  });

  it("persists a photo, runs the shipped Space client, and lists the same id for review", async () => {
    const store = createMemoryClaimStore();
    const bytes = jpegLikeBytes();
    const result = await persistAndInfer(
      store,
      {
        plotName: "North basin",
        khasraNumber: "241/14",
        cropType: "Wheat",
        createdBy: "user-farmer-1",
        farmerObservations: "Yellow pustules on flag leaf",
        captureLat: 27.89,
        captureLon: 76.28,
        images: [
          usableImage({
            bytes,
            lat: 27.89,
            lon: 76.28,
          }),
        ],
      },
      inferCropDisease,
      { fetchImpl: geminiFetchImpl() },
    );

    expect(store.claims.get(result.claimId)?.created_by).toBe("user-farmer-1");
    expect(result.prediction).not.toBeNull();
    expect(result.prediction!.modelId).toMatch(/gemini/i);
    expect(result.prediction!.label).toBe("wheat__disease");
    expect(result.prediction!.predictedGrade).toBe("C");
    expect(result.prediction!.score).toBe(0.81);

    const queue = await listReviewerQueue(store);
    expect(queue.map((item) => item.id)).toContain(result.claimId);

    const detail = await getReviewerClaim(store, result.claimId);
    expect(detail).not.toBeNull();
    expect(detail!.latest_prediction?.model_version).toMatch(/gemini/i);
    expect(detail!.latest_prediction?.adapter_type).toBe("gemini_vision");
    expect(detail!.latest_prediction?.primary_damage).toBe("wheat__disease");
    expect(detail!.latest_prediction?.predicted_crop).toBe("wheat");
    expect(detail!.latest_prediction?.predicted_grade).toBe("C");
    expect(detail!.latest_prediction?.severity).toBeNull();
    expect(detail!.latest_prediction?.affected_area_pct).toBeNull();
    expect(predictionIsAcceptable(detail!.latest_prediction, false)).toBe(true);
    expect(detail!.latest_prediction?.explanation).toMatchObject({
      predicted_grade: "C",
      grade_is_workflow_bucket: true,
    });
    expect(detail!.images).toHaveLength(1);
    expect(detail!.images[0].download_url).toMatch(/^memory:\/\//);
    const storedPath = detail!.images[0].download_url!.replace(/^memory:\/\//, "");
    expect(store.blobs.get(storedPath)).toEqual(bytes);

    const acted = await applyReviewerAction(store, result.claimId, {
      action: "request_recapture",
      reason: "Need wide_field",
      required_angles: ["wide_field"],
    });
    expect(acted.status).toBe("needs_recapture");
  });

  it("stores null plot_id when capture sends an empty unregistered-plot id", async () => {
    const store = createMemoryClaimStore();
    const persisted = await persistFarmerSubmission(store, {
      plotId: "",
      plotName: "Unregistered plot",
      images: [{ angleType: "closeup_damage", bytes: jpegLikeBytes() }],
    });
    expect(persisted.claim.plot_id).toBeNull();
    const stored = await store.getClaim(persisted.claimId);
    expect(stored?.plot_id).toBeNull();
  });

  it("still lists the persisted claim when Space inference fails", async () => {
    const store = createMemoryClaimStore();
    const bytes = jpegLikeBytes();
    const result = await persistAndInfer(
      store,
      {
        plotName: "East terrace",
        farmerObservations: "Leaf rust",
        images: [usableImage({ bytes, sha256: "c".repeat(64) })],
      },
      inferCropDisease,
      {
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: "Space is currently loading" }), { status: 503 }),
      },
    );

    expect(result.prediction).toBeNull();
    expect(result.inferError).toMatch(/503|failed|loading/i);
    const queue = await listReviewerQueue(store);
    expect(queue.map((item) => item.id)).toContain(result.claimId);
    const detail = await getReviewerClaim(store, result.claimId);
    expect(detail!.images).toHaveLength(1);
    const storedPath = detail!.images[0].download_url!.replace(/^memory:\/\//, "");
    expect(store.blobs.get(storedPath)).toEqual(bytes);
    expect(detail!.latest_prediction).toBeNull();
  });

  it("rejects Gemini payloads that have no class or grade", async () => {
    await expect(
      inferCropDisease({
        imageBytes: jpegLikeBytes(),
        fetchImpl: geminiFetchImpl({}),
      }),
    ).rejects.toThrow(/class or grade/i);
  });

  async function persistSeed(store = createMemoryClaimStore()) {
    const closeup = jpegLikeBytes();
    const result = await persistAndInfer(
      store,
      {
        cropType: "Wheat",
        createdBy: "user-farmer-1",
        images: [
          usableImage({
            bytes: closeup,
            lat: 27.89,
            lon: 76.28,
          }),
        ],
      },
      inferCropDisease,
      { fetchImpl: geminiFetchImpl() },
    );
    return { store, claimId: result.claimId, closeup };
  }

  it("maps Space grade onto latest_prediction.predicted_grade so Accept is allowed", async () => {
    const { store, claimId } = await persistSeed();
    const detail = await getReviewerClaim(store, claimId);
    expect(detail!.id).toBe(claimId);
    expect(detail!.latest_prediction?.predicted_grade).toBe("C");
    expect(predictionIsAcceptable(detail!.latest_prediction, false)).toBe(true);
    expect(predictionIsAcceptable(detail!.latest_prediction, true)).toBe(false);
    expect(
      predictionIsAcceptable(
        {
          primary_damage: "unknown",
          severity: null,
          affected_area_pct: null,
        },
        false,
      ),
    ).toBe(false);
  });

  it("reviewer actions update the same claim and persist correct overrides plus recapture angles", async () => {
    const cases = [
      { action: "accept", status: "verified" },
      { action: "physical_inspection", status: "physical_inspection" },
      { action: "reject", status: "rejected" },
    ] as const;
    for (const item of cases) {
      const { store, claimId } = await persistSeed();
      const acted = await applyReviewerAction(store, claimId, { action: item.action, notes: item.action });
      expect(acted.id).toBe(claimId);
      expect(acted.status).toBe(item.status);
      expect(store.reviewActions.some((row) => row.claim_id === claimId && row.action === item.action)).toBe(true);
    }

    const annotated = await persistSeed();
    const beforeStatus = annotated.store.claims.get(annotated.claimId)?.status;
    const noted = await applyReviewerAction(annotated.store, annotated.claimId, {
      action: "annotate",
      notes: "Gate re-run recorded: 2/2 usable",
    });
    expect(noted.status).toBe(beforeStatus);
    expect(annotated.store.reviewActions.some((row) => row.action === "annotate")).toBe(true);

    const closed = await persistSeed();
    await applyReviewerAction(closed.store, closed.claimId, { action: "accept", notes: "ok" });
    await expect(
      applyReviewerAction(closed.store, closed.claimId, { action: "reject", notes: "too late" }),
    ).rejects.toThrow(/verified/i);

    const recaptureSeed = await persistSeed();
    const recaptured = await applyReviewerAction(recaptureSeed.store, recaptureSeed.claimId, {
      action: "request_recapture",
      reason: "Need wide_field",
      required_angles: ["wide_field"],
    });
    expect(recaptured.id).toBe(recaptureSeed.claimId);
    expect(recaptured.status).toBe("needs_recapture");
    expect(recaptureSeed.store.claims.get(recaptureSeed.claimId)?.missing_angles).toEqual(["wide_field"]);
    expect(
      recaptureSeed.store.reviewActions.find((row) => row.action === "request_recapture")?.required_angles,
    ).toEqual(["wide_field"]);

    const correctSeed = await persistSeed();
    const corrected = await applyReviewerAction(correctSeed.store, correctSeed.claimId, {
      action: "correct",
      notes: "Human override",
      reason: "Screening correction",
      corrected_crop: "maize",
      corrected_grade: "B",
      corrected_severity: "medium",
      corrected_damage_codes: ["leaf_blight"],
      corrected_affected_area_pct: 18,
      corrected_growth_stage: "tillering",
    });
    expect(corrected.id).toBe(correctSeed.claimId);
    expect(corrected.status).toBe("verified");
    const stored = correctSeed.store.claims.get(correctSeed.claimId);
    expect(stored?.corrected_crop).toBe("maize");
    expect(stored?.crop_identified).toBe("maize");
    expect(stored?.corrected_grade).toBe("B");
    expect(stored?.severity_grade).toBe("B");
    expect(stored?.corrected_severity).toBe("medium");
    expect(stored?.corrected_damage_codes).toEqual(["leaf_blight"]);
    expect(stored?.disease_detected).toBe("leaf_blight");
    expect(stored?.corrected_affected_area_pct).toBe(18);
    expect(stored?.corrected_growth_stage).toBe("tillering");
    expect(correctSeed.store.reviewActions.some((row) => row.action === "correct")).toBe(true);
  });

  it("recapture updates the original claim in place without re-posting kept images", async () => {
    const { store, claimId, closeup } = await persistSeed();
    await applyReviewerAction(store, claimId, {
      action: "request_recapture",
      required_angles: ["wide_field"],
    });
    const before = await store.listImages(claimId);
    expect(before).toHaveLength(1);
    const keptPath = before[0].storage_path;
    const keptUrl = before[0].image_url;
    const wide = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 9, 8, 7, 6, 5, 4]);

    const recaptured = await recaptureAndInfer(
      store,
      {
        claimId,
        images: [
          usableImage({
            angleType: "wide_field",
            bytes: wide,
            sha256: "d".repeat(64),
            lat: 27.9,
            lon: 76.3,
          }),
        ],
      },
      inferCropDisease,
      { fetchImpl: geminiFetchImpl() },
    );

    expect(recaptured.claimId).toBe(claimId);
    expect(store.claims.size).toBe(1);
    const after = await store.listImages(claimId);
    expect(after).toHaveLength(2);
    const kept = after.find((row) => row.angle_type === "closeup_damage");
    const added = after.find((row) => row.angle_type === "wide_field");
    expect(kept?.image_url).toBe(keptUrl);
    expect(kept?.storage_path).toBe(keptPath);
    expect(kept?.image_url).not.toMatch(/^data:/);
    expect(added?.image_url).toMatch(/^memory:\/\//);
    expect(store.blobs.get(added!.storage_path!)).toEqual(wide);
    expect(store.blobs.get(kept!.storage_path!)).toEqual(closeup);
    const claim = store.claims.get(claimId);
    expect(claim?.status).toBe("under_review");
    expect(claim?.missing_angles).toEqual(["left_context", "mid_canopy", "right_context"]);
    const detail = await getReviewerClaim(store, claimId);
    expect(detail!.id).toBe(claimId);
    expect(detail!.status).toBe("under_review");
    expect(detail!.images.map((img) => img.angle_type).sort()).toEqual(["closeup_damage", "wide_field"]);
  });

  it("farmer recapture payload keeps the original id and only new data-URL bytes", () => {
    const payload = buildRecaptureSubmitInput(
      "claim-original",
      {
        plotId: "plot-1",
        plotName: "North",
        plotNameHi: "",
        khasraNumber: "1",
        cropType: "Wheat",
        cropTypeHi: "",
        cropVariety: "",
        farmerObservations: "flag leaf",
      },
      [
        {
          angleType: "wide_field",
          imageUrl: "data:image/jpeg;base64,abc",
          lat: 1,
          lon: 2,
          accuracyM: 4,
          sha256: "e".repeat(64),
        },
        {
          angleType: "closeup_damage",
          imageUrl: "https://example.supabase.co/storage/closeup.jpg",
          lat: 1,
          lon: 2,
          accuracyM: 4,
          sha256: "b".repeat(64),
        },
      ],
    );
    expect(payload.id).toBe("claim-original");
    expect(payload.images).toHaveLength(1);
    expect(payload.images[0].angleType).toBe("wide_field");
    expect(payload.images[0].imageDataUrl.startsWith("data:")).toBe(true);
    expect(() =>
      buildRecaptureSubmitInput(
        "claim-original",
        {
          plotId: "",
          plotName: "",
          plotNameHi: "",
          khasraNumber: "",
          cropType: "",
          cropTypeHi: "",
          cropVariety: "",
          farmerObservations: "",
        },
        [
          {
            angleType: "closeup_damage",
            imageUrl: "https://kept.example/closeup.jpg",
            lat: null,
            lon: null,
            accuracyM: null,
            sha256: "",
          },
        ],
      ),
    ).toThrow(/newly captured/i);
  });

  it("keeps farmer and reviewer claim traffic on hosted Next routes when Supabase is configured", () => {
    expect(resolveClaimClientPath(true, "submit")).toEqual({ hosted: true, path: "/api/claims" });
    expect(resolveClaimClientPath(true, "list")).toEqual({ hosted: true, path: "/api/claims" });
    expect(resolveClaimClientPath(true, "get", "claim-1")).toEqual({
      hosted: true,
      path: "/api/claims/claim-1",
    });
    expect(resolveClaimClientPath(true, "action", "claim-1")).toEqual({
      hosted: true,
      path: "/api/claims/claim-1/action",
    });
    expect(resolveClaimClientPath(true, "submit").path).not.toMatch(/backend/);
    expect(resolveClaimClientPath(false, "list").hosted).toBe(false);
    expect(resolveClaimClientPath(false, "action", "x").path).toBe("/review/x/action");
  });

  it("does not send black frames to the Space and stores grade U without a crop", async () => {
    let inferCalls = 0;
    const store = createMemoryClaimStore();
    const result = await persistAndInfer(
      store,
      {
        cropType: "Wheat",
        images: [
          {
            angleType: "closeup_damage",
            bytes: jpegLikeBytes(),
            lightingScore: 0,
            qualityPassed: false,
          },
          {
            angleType: "wide_field",
            bytes: jpegLikeBytes(),
            lightingScore: 3,
            qualityPassed: false,
          },
        ],
      },
      async () => {
        inferCalls += 1;
        throw new Error("Space should not be called");
      },
    );
    expect(inferCalls).toBe(0);
    expect(result.prediction?.predictedGrade).toBe("U");
    expect(result.prediction?.predictedCrop).toBe("unknown");
    expect(result.prediction?.score).toBe(0);
    const detail = await getReviewerClaim(store, result.claimId);
    expect(detail!.latest_prediction?.predicted_grade).toBe("U");
    expect(detail!.latest_prediction?.predicted_crop).toBe("unknown");
    expect(detail!.latest_prediction?.crop_confidence).toBe(0);
    expect(detail!.latest_prediction?.overall_confidence).toBe(0);
  });

  it("fails CLOSED when the vision gate throws on first submission and never reaches inference", async () => {
    const store = createMemoryClaimStore();
    let inferCalls = 0;
    // Poison a gate-only metadata field: gateSingleImage reads greenPct when building the
    // Gemini/heuristic metadata payload, but nothing after the gate touches it.
    const poisoned: PersistedImageInput = {
      angleType: "closeup_damage",
      bytes: jpegLikeBytes(),
      sha256: "f".repeat(64),
      get greenPct(): number {
        throw new Error("gate metadata boom");
      },
    };
    const result = await persistAndInfer(
      store,
      {
        cropType: "Wheat",
        plotName: "Gate outage farm",
        images: [poisoned],
      },
      async () => {
        inferCalls += 1;
        throw new Error("Space should never be called when the gate is unavailable");
      },
      { fetchImpl: geminiFetchImpl() },
    );

    // B1 regression: gate error → unusable gate_unavailable prediction, no ungated HF call.
    expect(inferCalls).toBe(0);
    expect(result.prediction?.label).toBe("unusable_or_out_of_domain");
    expect(result.prediction?.predictedGrade).toBe("U");
    expect(result.prediction?.qualityWarnings).toEqual(["gate_unavailable"]);

    // Claim is persisted under_review with the failure recorded for reviewer adjudication.
    const stored = store.claims.get(result.claimId);
    expect(stored?.status).toBe("under_review");
    expect(stored?.quality_notes).toBe("Gate rejected: gate_unavailable");
    expect(stored?.overall_confidence).toBe(0);
    const gateResult = stored?.gate_result as { blockingReason?: string; error?: string };
    expect(gateResult.blockingReason).toBe("gate_unavailable");
    expect(String(gateResult.error)).toMatch(/boom/i);

    const detail = await getReviewerClaim(store, result.claimId);
    expect(detail!.latest_prediction?.predicted_grade).toBe("U");
    // Reviewer view surfaces the persisted gate note as the warning.
    expect(detail!.latest_prediction?.quality_warnings).toContain("Gate rejected: gate_unavailable");
  });

  it("fails CLOSED when the vision gate throws during recapture", async () => {
    const seeded = await persistSeed();
    await applyReviewerAction(seeded.store, seeded.claimId, {
      action: "request_recapture",
      required_angles: ["wide_field"],
    });
    let inferCalls = 0;
    // Same gate-only poison as the submission test above.
    const poisoned: PersistedImageInput = {
      angleType: "wide_field",
      bytes: jpegLikeBytes(),
      sha256: "1".repeat(64),
      get greenPct(): number {
        throw new Error("gate metadata boom");
      },
    };
    const result = await recaptureAndInfer(
      seeded.store,
      {
        claimId: seeded.claimId,
        images: [poisoned],
      },
      async () => {
        inferCalls += 1;
        throw new Error("Space should never be called when the gate is unavailable");
      },
      { fetchImpl: geminiFetchImpl() },
    );

    expect(inferCalls).toBe(0);
    expect(result.prediction?.qualityWarnings).toEqual(["gate_unavailable"]);
    expect(result.prediction?.predictedGrade).toBe("U");
    const stored = seeded.store.claims.get(seeded.claimId);
    expect(stored?.status).toBe("under_review");
    expect(stored?.quality_notes).toBe("Gate rejected: gate_unavailable");
  });

  it("strips wheat 100% from an unusable Space payload", () => {
    const sanitized = sanitizeHfPrediction({
      modelId: "dhrrishitvdeka/fasal-pramaan-model",
      label: "wheat",
      score: 1,
      predictedCrop: "wheat",
      cropConfidence: 1,
      predictedGrade: "U",
      primaryDamage: "unknown",
      qualityWarnings: ["image_too_dark"],
      raw: {},
    });
    expect(sanitized.predictedCrop).toBe("unknown");
    expect(sanitized.cropConfidence).toBe(0);
    expect(sanitized.score).toBe(0);
  });

  it("disallows one-click acceptance on unusable Grade U claims", () => {
    expect(predictionIsAcceptable({ predicted_grade: "U" }, false)).toBe(false);
    expect(predictionIsAcceptable({ predicted_grade: "A" }, false)).toBe(true);
    expect(predictionIsAcceptable({ predicted_grade: "B" }, false)).toBe(true);
    expect(predictionIsAcceptable({ predicted_grade: "C" }, false)).toBe(true);
  });

  it("allows Accept when the Space prediction is still missing", () => {
    expect(predictionIsAcceptable(null, false)).toBe(true);
    expect(predictionIsAcceptable(undefined, false)).toBe(true);
    expect(predictionIsAcceptable(null, true)).toBe(false);
  });

  it("does not let late inference overwrite a reviewer's verified grade", async () => {
    const { store, claimId } = await persistSeed();
    await applyReviewerAction(store, claimId, { action: "accept", notes: "ok" });
    await attachHfPrediction(store, claimId, {
      modelId: "late-model",
      label: "maize__healthy",
      score: 0.99,
      predictedCrop: "maize",
      cropConfidence: 0.99,
      predictedGrade: "A",
      primaryDamage: "healthy",
      plantDiseaseClass: "maize__healthy",
      raw: {},
    });
    const stored = store.claims.get(claimId);
    expect(stored?.status).toBe("verified");
    expect(stored?.severity_grade).toBe("C");
    expect(stored?.crop_identified).toBe("wheat");
    expect(stored?.model_id).toBe("late-model");
    expect(stored?.inference_status).toBe("complete");
  });

  it("refuses recapture of a verified claim", async () => {
    const { store, claimId } = await persistSeed();
    await applyReviewerAction(store, claimId, { action: "accept", notes: "ok" });
    await expect(
      recaptureAndInfer(
        store,
        { claimId, images: [{ angleType: "wide_field", bytes: jpegLikeBytes() }] },
        inferCropDisease,
        { fetchImpl: geminiFetchImpl() },
      ),
    ).rejects.toThrow(/verified/i);
  });

  it("surfaces client-chosen claim id collisions as Claim already exists", async () => {
    const store = createMemoryClaimStore();
    await persistFarmerSubmission(store, {
      id: "claim-fixed",
      images: [{ angleType: "closeup_damage", bytes: jpegLikeBytes() }],
    });
    await expect(
      persistFarmerSubmission(store, {
        id: "claim-fixed",
        images: [{ angleType: "closeup_damage", bytes: jpegLikeBytes() }],
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("does not insert a claim when an image upload fails mid-loop", async () => {
    const store = createMemoryClaimStore();
    const original = store.uploadImage.bind(store);
    let n = 0;
    store.uploadImage = async (path, bytes, contentType) => {
      n += 1;
      if (n === 2) throw new Error("upload boom");
      return original(path, bytes, contentType);
    };
    await expect(
      persistFarmerSubmission(store, {
        images: [
          { angleType: "closeup_damage", bytes: jpegLikeBytes() },
          { angleType: "wide_field", bytes: jpegLikeBytes() },
        ],
      }),
    ).rejects.toThrow(/upload boom/);
    expect(store.claims.size).toBe(0);
  });

  it("sanitizes storage path segments against traversal", () => {
    expect(safeStorageSegment("../../etc/passwd", "claim")).toBe("passwd");
    expect(safeStorageSegment("wide_field", "angle")).toBe("wide_field");
    expect(safeStorageSegment("..", "fallback")).toBe("fallback");
  });

  it("retries pending inference from stored blobs", async () => {
    const store = createMemoryClaimStore();
    const persisted = await persistAndInfer(
      store,
      {
        cropType: "Wheat",
        images: [usableImage()],
      },
      inferCropDisease,
      { fetchImpl: geminiFetchImpl(), skipInference: true },
    );
    expect(persisted.pendingInference).toBe(true);
    expect(store.claims.get(persisted.claimId)?.hf_label).toBeFalsy();
    store.claims.get(persisted.claimId)!.inference_started_at = new Date(Date.now() - 120_000).toISOString();
    const retried = await retryPendingInference(store, persisted.claimId, inferCropDisease, {
      fetchImpl: geminiFetchImpl(),
    });
    expect(retried?.prediction?.predictedGrade).toBe("C");
    expect(store.claims.get(persisted.claimId)?.inference_status).toBe("complete");
  });
});
