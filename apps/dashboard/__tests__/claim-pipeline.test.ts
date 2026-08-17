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
import { inferCropDisease } from "../src/lib/hf-infer";

function jpegLikeBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
}

describe("claim persist + HF + reviewer queue", () => {
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

  it("persists a photo, runs the shipped HF client, and lists the same id for review", async () => {
    const store = createMemoryClaimStore();
    const bytes = jpegLikeBytes();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify([{ label: "Tomato_Late_blight", score: 0.91 }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const result = await persistAndInfer(
      store,
      {
        plotName: "North basin",
        khasraNumber: "241/14",
        cropType: "Wheat",
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
      { fetchImpl, modelId: "wambugu71/crop_leaf_diseases_vit" },
    );

    expect(result.prediction).not.toBeNull();
    expect(result.prediction!.modelId).toBe("wambugu71/crop_leaf_diseases_vit");
    expect(result.prediction!.label).toBe("Tomato_Late_blight");
    expect(result.prediction!.score).toBe(0.91);

    const queue = await listReviewerQueue(store);
    expect(queue.map((item) => item.id)).toContain(result.claimId);

    const detail = await getReviewerClaim(store, result.claimId);
    expect(detail).not.toBeNull();
    expect(detail!.latest_prediction?.model_version).toBe("wambugu71/crop_leaf_diseases_vit");
    expect(detail!.latest_prediction?.primary_damage).toBe("Tomato_Late_blight");
    expect(detail!.latest_prediction?.overall_confidence).toBe(0.91);
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

  it("still lists the persisted claim when Hugging Face inference fails", async () => {
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
          new Response(JSON.stringify({ error: "Model is currently loading" }), { status: 503 }),
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

  it("rejects Hugging Face payloads that have no label", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "Model is currently loading" }), { status: 200 });
    await expect(
      inferCropDisease({
        imageBytes: jpegLikeBytes(),
        fetchImpl,
        modelId: "wambugu71/crop_leaf_diseases_vit",
      }),
    ).rejects.toThrow(/loading|label/i);
  });
});
