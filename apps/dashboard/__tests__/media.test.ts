import { describe, expect, it } from "vitest";
import { cameraConstraintLadder, isSafeDisplayUrl, safeDisplayUrl } from "../src/lib/media";

describe("hosted media helpers", () => {
  it("rejects file:// and empty values so capture never links off-origin files", () => {
    expect(isSafeDisplayUrl("file:///C:/Users/pic.jpg")).toBe(false);
    expect(isSafeDisplayUrl("file:///")).toBe(false);
    expect(isSafeDisplayUrl("C:\\\\Users\\\\pic.jpg")).toBe(false);
    expect(isSafeDisplayUrl("")).toBe(false);
    expect(isSafeDisplayUrl(null)).toBe(false);
    expect(safeDisplayUrl("file:///tmp/a.jpg")).toBeUndefined();
  });

  it("allows data, blob, and https image URLs used by capture and Supabase", () => {
    expect(isSafeDisplayUrl("data:image/jpeg;base64,abc")).toBe(true);
    expect(isSafeDisplayUrl("blob:https://fasal-pramaan-nullpointers.vercel.app/1")).toBe(true);
    expect(isSafeDisplayUrl("https://ifaoittxcrmlpkadixxt.supabase.co/storage/v1/object/sign/x")).toBe(
      true,
    );
    expect(safeDisplayUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
  });

  it("asks for camera with fallbacks instead of a single 1080p lock", () => {
    const ladder = cameraConstraintLadder("environment");
    expect(ladder.length).toBeGreaterThanOrEqual(3);
    expect(ladder[0]?.video).toEqual(
      expect.objectContaining({ facingMode: { ideal: "environment" } }),
    );
    expect(ladder[ladder.length - 1]).toEqual({ audio: false, video: true });
  });
});
