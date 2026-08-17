import { describe, expect, it } from "vitest";
import {
  applyReviewerAction,
  computeEvidencePreview,
  createMemoryClaimStore,
  getReviewerClaim,
  listReviewerQueue,
  persistAndInfer,
  persistFarmerSubmission,
} from "../src/lib/claim-pipeline";
import { inferCropDisease, parseSpacePrediction } from "../src/lib/hf-infer";

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
    expect(detail!.latest_prediction?.severity).toBeNull();
    expect(detail!.latest_prediction?.affected_area_pct).toBeNull();
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
});
