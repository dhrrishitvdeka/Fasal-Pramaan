import { describe, expect, it } from "vitest";
import {
  applyReviewerAction,
  buildRecaptureSubmitInput,
  computeEvidencePreview,
  createMemoryClaimStore,
  getReviewerClaim,
  listReviewerQueue,
  persistAndInfer,
  persistFarmerSubmission,
  recaptureAndInfer,
  sanitizeHfPrediction,
} from "../src/lib/claim-pipeline";
import { inferCropDisease, parseSpacePrediction } from "../src/lib/hf-infer";
import { predictionIsAcceptable } from "../src/lib/review-accept";
import { resolveClaimClientPath } from "../src/lib/claim-routes";

function jpegLikeBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
}

const spaceSuccess = {
  ok: true,
  model_id: "dhrrishitvdeka/fasal-pramaan-model",
  model_version: "4.0.0-dinov2-v14",
  adapter_type: "crop_health_v4",
  predicted_crop: "wheat",
  crop_confidence: 0.88,
  predicted_grade: "C",
  grade_label: "disease_pattern_signal",
  plant_disease_class: "wheat__disease",
  label: "wheat__disease",
  score: 0.81,
  primary_damage: "disease",
  severity: null,
  estimated_affected_area_pct: null,
  overall_confidence: 0.81,
  human_review_recommendation: "normal_human_review",
};

function spaceFetchImpl(): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.includes("/gradio_api/call/predict_api/") && !url.endsWith("predict_api")) {
      return new Response(`data: ${JSON.stringify([spaceSuccess])}\n\n`, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    return new Response(JSON.stringify({ event_id: "evt-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
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

  it("parses the Space contract and rejects the retired placeholder classifier", () => {
    const parsed = parseSpacePrediction(spaceSuccess);
    expect(parsed.modelId).toBe("dhrrishitvdeka/fasal-pramaan-model");
    expect(parsed.predictedGrade).toBe("C");
    expect(parsed.plantDiseaseClass).toBe("wheat__disease");
    expect(parsed.score).toBe(0.81);
    expect(parseSpacePrediction(spaceSuccess).raw).toMatchObject({ severity: null });
    expect(() =>
      parseSpacePrediction([{ label: "Tomato_Late_blight", score: 0.91 }]),
    ).toThrow(/placeholder/i);
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
          {
            angleType: "closeup_damage",
            bytes,
            sha256: "b".repeat(64),
            lat: 27.89,
            lon: 76.28,
          },
        ],
      },
      inferCropDisease,
      { fetchImpl: spaceFetchImpl() },
    );

    expect(store.claims.get(result.claimId)?.created_by).toBe("user-farmer-1");
    expect(result.prediction).not.toBeNull();
    expect(result.prediction!.modelId).toBe("dhrrishitvdeka/fasal-pramaan-model");
    expect(result.prediction!.label).toBe("wheat__disease");
    expect(result.prediction!.predictedGrade).toBe("C");
    expect(result.prediction!.score).toBe(0.81);

    const queue = await listReviewerQueue(store);
    expect(queue.map((item) => item.id)).toContain(result.claimId);

    const detail = await getReviewerClaim(store, result.claimId);
    expect(detail).not.toBeNull();
    expect(detail!.latest_prediction?.model_version).toBe("dhrrishitvdeka/fasal-pramaan-model");
    expect(detail!.latest_prediction?.adapter_type).toBe("crop_health_v4");
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
        images: [{ angleType: "closeup_damage", bytes, sha256: "c".repeat(64) }],
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

  it("rejects Space payloads that have no class or grade", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ event_id: "evt-empty" }), { status: 200 });
    const poll: typeof fetch = async (input) => {
      if (String(input).includes("evt-empty")) {
        return new Response(JSON.stringify({ error: "Model is currently loading" }), { status: 200 });
      }
      return fetchImpl(input);
    };
    await expect(
      inferCropDisease({
        imageBytes: jpegLikeBytes(),
        fetchImpl: poll,
      }),
    ).rejects.toThrow(/loading|class|grade|Space/i);
  });

  async function persistSeed(store = createMemoryClaimStore()) {
    const closeup = jpegLikeBytes();
    const result = await persistAndInfer(
      store,
      {
        cropType: "Wheat",
        createdBy: "user-farmer-1",
        images: [
          {
            angleType: "closeup_damage",
            bytes: closeup,
            sha256: "b".repeat(64),
            lat: 27.89,
            lon: 76.28,
          },
        ],
      },
      inferCropDisease,
      { fetchImpl: spaceFetchImpl() },
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
          {
            angleType: "wide_field",
            bytes: wide,
            sha256: "d".repeat(64),
            lat: 27.9,
            lon: 76.3,
          },
        ],
      },
      inferCropDisease,
      { fetchImpl: spaceFetchImpl() },
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
});
