import { describe, expect, it } from "vitest";
import {
  applyVideoPlaybackFlags,
  cameraConstraintLadder,
  isSafeDisplayUrl,
  safeDisplayUrl,
  videoHasFrame,
  waitForVideoFrame,
} from "../src/lib/media";

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
    expect(ladder[0]?.video).toEqual(expect.objectContaining({ facingMode: "environment" }));
    expect(ladder.some((item) => item.video === true)).toBe(true);
  });

  it("treats a zero-size video as having no frame", () => {
    expect(videoHasFrame({ videoWidth: 0, videoHeight: 0 })).toBe(false);
    expect(videoHasFrame({ videoWidth: 1280, videoHeight: 720 })).toBe(true);
  });

  it("sets playsinline flags used by iOS Safari", () => {
    const attrs = new Map<string, string>();
    const video = {
      muted: false,
      defaultMuted: false,
      autoplay: false,
      playsInline: false,
      setAttribute: (name: string, value: string) => attrs.set(name, value),
    } as unknown as HTMLVideoElement;
    applyVideoPlaybackFlags(video);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(attrs.get("webkit-playsinline")).toBe("true");
  });

  it("resolves once videoWidth appears even if media events already fired", async () => {
    const video = {
      videoWidth: 0,
      videoHeight: 0,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as HTMLVideoElement;
    const pending = waitForVideoFrame(video, 500);
    setTimeout(() => {
      Object.assign(video, { videoWidth: 640, videoHeight: 480 });
    }, 30);
    await expect(pending).resolves.toBeUndefined();
  });

  it("times out when the camera never produces a frame", async () => {
    const listeners = new Map<string, () => void>();
    const video = {
      videoWidth: 0,
      videoHeight: 0,
      addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    } as unknown as HTMLVideoElement;
    await expect(waitForVideoFrame(video, 20)).rejects.toThrow(/no video frames/i);
  });
});
