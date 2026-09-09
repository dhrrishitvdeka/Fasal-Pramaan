import { describe, expect, it } from "vitest";
import { parseCookieHeader, publicOrigin } from "../src/lib/auth-cookies";
import { safeInternalPath } from "../src/lib/safe-path";
import { sniffImageMime } from "../src/lib/image-bytes";
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

describe("publicOrigin", () => {
  it("ignores a spoofed forwarded host when APP_ORIGIN is set", () => {
    const previous = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://fasal.example";
    const origin = publicOrigin(
      new Request("http://localhost:3000/api/auth/forgot", {
        headers: { "x-forwarded-host": "evil.tld", host: "evil.tld" },
      }),
    );
    expect(origin).toBe("https://fasal.example");
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
});

describe("safeInternalPath", () => {
  it("rejects protocol-relative and off-site next values", () => {
    expect(safeInternalPath("//evil.com", "/farmer")).toBe("/farmer");
    expect(safeInternalPath("/\\evil.com", "/farmer")).toBe("/farmer");
    expect(safeInternalPath("https://evil.com", "/farmer")).toBe("/farmer");
    expect(safeInternalPath("/review/abc", "/farmer")).toBe("/review/abc");
  });
});

describe("image magic bytes", () => {
  it("accepts JPEG and rejects empty payloads", () => {
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(sniffImageMime(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
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
