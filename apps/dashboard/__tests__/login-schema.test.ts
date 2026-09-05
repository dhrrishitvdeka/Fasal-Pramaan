import { describe, expect, it } from "vitest";
import { claimSubmissionSchema, loginSchema } from "../src/lib/schemas";

describe("login form schema", () => {
  it("accepts valid credentials", () => {
    const r = loginSchema.safeParse({
      email: "reviewer@fasalpramaan.local",
      password: "Demo@12345",
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const r = loginSchema.safeParse({ email: "not-an-email", password: "Demo@12345" });
    expect(r.success).toBe(false);
  });
});

describe("claim submission schema", () => {
  const jpeg = "data:image/jpeg;base64,aaaa";

  it("accepts a GPS-less unregistered-plot payload with null optionals", () => {
    const r = claimSubmissionSchema.safeParse({
      images: [{ imageDataUrl: jpeg, angleType: "wide_field", lat: null, lon: null, accuracyM: null }],
      plotId: "",
      plotLat: null,
      plotLon: null,
      captureLat: null,
      captureLon: null,
      sowingDate: null,
      intentId: "",
      peril: "fire_burn",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.captureLat).toBeUndefined();
      expect(r.data.sowingDate).toBeUndefined();
      expect(r.data.intentId).toBeUndefined();
      expect(r.data.peril).toBe("fire_burn");
    }
  });

  it("coerces a datetime sowingDate down to YYYY-MM-DD", () => {
    const r = claimSubmissionSchema.safeParse({
      images: [{ imageDataUrl: jpeg, angleType: "closeup_damage" }],
      sowingDate: "2026-11-15T08:00:00.000Z",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sowingDate).toBe("2026-11-15");
  });
});
