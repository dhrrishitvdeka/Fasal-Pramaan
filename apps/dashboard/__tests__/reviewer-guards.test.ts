import { describe, expect, it } from "vitest";
import {
  applyReviewerAction,
  createMemoryClaimStore,
  persistAndInfer,
  type PersistedImageInput,
} from "../src/lib/claim-pipeline";
import { inferCropDisease } from "../src/lib/gemini-analyze";

function jpegLikeBytes(): Uint8Array {
  const bytes = new Uint8Array(8192);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
  return bytes;
}

function usableImage(overrides: Partial<PersistedImageInput> = {}): PersistedImageInput {
  return {
    angleType: "closeup_damage",
    bytes: jpegLikeBytes(),
    sha256: "c".repeat(64),
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
  reasoning: "Rust pustules on flag leaf.",
  visual_findings: "Wheat canopy with foliar rust.",
  authenticity: {
    authentic: true,
    screen_replay: false,
    ai_generated: false,
    printed_photo: false,
    indoor_scene: false,
    reason: "Outdoor field photograph",
  },
  per_image: [{ angle_type: "closeup_damage", usable: true, crop: "wheat", damage_visible: true, findings: "x" }],
  human_review_recommendation: "human_review",
};

function geminiFetchImpl(): typeof fetch {
  return async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiSuccess) }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

async function persistSeed(store = createMemoryClaimStore()) {
  const result = await persistAndInfer(
    store,
    { cropType: "Wheat", createdBy: "user-farmer-1", images: [usableImage()] },
    inferCropDisease,
    { fetchImpl: geminiFetchImpl() },
  );
  return { store, claimId: result.claimId };
}

describe("reviewer payout guards", () => {
  it("blocks accept while AI inference is still pending", async () => {
    const { store, claimId } = await persistSeed();
    const row = store.claims.get(claimId) as any;
    row.inference_status = "pending";
    await expect(applyReviewerAction(store, claimId, { action: "accept", notes: "ok" })).rejects.toThrow(
      /not complete/i,
    );
  });

  it("blocks accept while AI inference has failed", async () => {
    const { store, claimId } = await persistSeed();
    const row = store.claims.get(claimId) as any;
    row.inference_status = "failed";
    await expect(applyReviewerAction(store, claimId, { action: "accept", notes: "ok" })).rejects.toThrow(
      /not complete/i,
    );
  });

  it("keeps grade U blocked even after a reasoned gate override", async () => {
    const { store, claimId } = await persistSeed();
    const row = store.claims.get(claimId) as any;
    row.severity_grade = "U";
    await applyReviewerAction(store, claimId, { action: "override_gate", notes: "Field visit confirmed" });
    // Override no longer launders U into a payable grade.
    expect(store.claims.get(claimId)?.severity_grade).toBe("U");
    await expect(applyReviewerAction(store, claimId, { action: "accept", notes: "ok" })).rejects.toThrow(
      /grade U/i,
    );
    // An explicit grade via correct verifies with the chosen grade.
    const acted = await applyReviewerAction(store, claimId, {
      action: "correct",
      notes: "ok",
      corrected_grade: "B",
    });
    expect(acted.status).toBe("verified");
    expect(store.claims.get(claimId)?.severity_grade).toBe("B");
  });

  it("requires a reason for override_gate", async () => {
    const { store, claimId } = await persistSeed();
    await expect(applyReviewerAction(store, claimId, { action: "override_gate" })).rejects.toThrow(/reason/i);
    await expect(
      applyReviewerAction(store, claimId, { action: "override_gate", notes: "   " }),
    ).rejects.toThrow(/reason/i);
  });

  it("voids the settled payout when a terminal claim is reopened", async () => {
    const { store, claimId } = await persistSeed();
    await applyReviewerAction(store, claimId, { action: "accept", notes: "ok" });
    const settled = store.claims.get(claimId) as any;
    expect(settled.status).toBe("verified");
    expect(settled.payout_status).toBe("approved");
    await applyReviewerAction(store, claimId, {
      action: "request_recapture",
      reason: "Need clearer wide shot",
      required_angles: ["wide_field"],
    });
    const reopened = store.claims.get(claimId) as any;
    expect(reopened.status).toBe("needs_recapture");
    expect(reopened.payout_status).toBe("needs_action");
    expect(reopened.payout_amount_inr).toBeNull();
  });
});
