import { describe, expect, it } from "vitest";
import { parseCookieHeader } from "../src/lib/auth-cookies";
import { isFireRelaxAngle } from "../src/lib/vision/cv-core";

describe("auth cookie parsing", () => {
  it("parses a Cookie header into name/value pairs", () => {
    const cookies = parseCookieHeader("sb-access-token=abc; theme=light; empty=");
    expect(cookies.find((c) => c.name === "sb-access-token")?.value).toBe("abc");
    expect(cookies.find((c) => c.name === "theme")?.value).toBe("light");
  });

  it("returns an empty list for a missing header", () => {
    expect(parseCookieHeader(null)).toEqual([]);
    expect(parseCookieHeader("")).toEqual([]);
  });
});

describe("fire shutter relax", () => {
  it("does not treat ordinary capture slots as fire", () => {
    expect(isFireRelaxAngle("photo_1")).toBe(false);
    expect(isFireRelaxAngle("wide_field")).toBe(false);
    expect(isFireRelaxAngle("closeup_damage")).toBe(false);
  });

  it("relaxes only when the peril or angle is fire/burn", () => {
    expect(isFireRelaxAngle("photo_1", "fire_burn")).toBe(true);
    expect(isFireRelaxAngle("fire_burn")).toBe(true);
    expect(isFireRelaxAngle("ash_burn_closeup")).toBe(true);
  });
});
