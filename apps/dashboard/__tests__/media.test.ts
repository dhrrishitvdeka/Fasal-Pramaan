import { describe, expect, it } from "vitest";
import {
  applyVideoPlaybackFlags,
  attachStreamToVideo,
  cameraConstraintLadder,
  isSafeDisplayUrl,
  safeDisplayUrl,
  videoFrameCaptureSize,
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

  it("prefers environment, then unconstrained video, then the user-facing camera", () => {
    const ladder = cameraConstraintLadder("environment");
    expect(ladder[0]?.video).toEqual({ facingMode: "environment" });
    expect(ladder[1]?.video).toEqual({ facingMode: { ideal: "environment" } });
    const unconstrainedAt = ladder.findIndex((item) => item.video === true);
    expect(unconstrainedAt).toBeGreaterThan(0);
    const oppositeAt = ladder.findIndex((item) => {
      if (typeof item.video !== "object" || item.video === null || !("facingMode" in item.video)) {
        return false;
      }
      const facing = item.video.facingMode;
      return (
        typeof facing === "object" &&
        facing !== null &&
        !Array.isArray(facing) &&
        "ideal" in facing &&
        facing.ideal === "user"
      );
    });
    expect(oppositeAt).toBeGreaterThan(unconstrainedAt);
    expect(ladder[ladder.length - 1]?.video).toEqual({ facingMode: { ideal: "user" } });
  });

  it("treats a zero-size video as having no frame", () => {
    expect(videoHasFrame({ videoWidth: 0, videoHeight: 0 })).toBe(false);
    expect(videoHasFrame({ videoWidth: 1280, videoHeight: 720 })).toBe(true);
  });

  it("never invents 1280×720 when videoWidth is 0", () => {
    expect(videoFrameCaptureSize({ videoWidth: 0, videoHeight: 0 })).toBeNull();
    expect(videoFrameCaptureSize({ videoWidth: 0, videoHeight: 720 })).toBeNull();
    expect(videoFrameCaptureSize({ videoWidth: 640, videoHeight: 480 })).toEqual({
      width: 640,
      height: 480,
    });
    const missing = videoFrameCaptureSize({ videoWidth: 0, videoHeight: 0 });
    const width = missing?.width ?? 0;
    expect(width).not.toBe(1280);
    expect(missing).toBeNull();
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

  it("sets playsinline flags before assigning srcObject", async () => {
    const order: string[] = [];
    let srcObject: MediaStream | null = null;
    const video = {
      muted: false,
      defaultMuted: false,
      autoplay: false,
      playsInline: false,
      videoWidth: 320,
      videoHeight: 240,
      setAttribute: () => {
        order.push("flags");
      },
      play: async () => {
        order.push("play");
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as HTMLVideoElement;
    Object.defineProperty(video, "srcObject", {
      get: () => srcObject,
      set: (value: MediaStream | null) => {
        order.push("srcObject");
        srcObject = value;
      },
    });
    const stream = { id: "s1" } as unknown as MediaStream;
    const gotFrame = await attachStreamToVideo(video, stream, 50);
    expect(gotFrame).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(order.indexOf("flags")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("srcObject")).toBeGreaterThan(order.indexOf("flags"));
    expect(order.indexOf("play")).toBeGreaterThan(order.indexOf("srcObject"));
  });
});
