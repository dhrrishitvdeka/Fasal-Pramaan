import { describe, it, expect } from "vitest";
import { analyzeInWorker } from "@/lib/vision/cv-worker";

describe("Realtime CV Multi-Spectral Crop & Usability Analyzer", () => {
  const width = 32;
  const height = 32;
  const pixelCount = width * height;

  it("accurately detects healthy green vegetative crop foliage with realistic field framing", () => {
    const data = new Uint8ClampedArray(pixelCount * 4);
    // Fill with 75% textured green crop foliage and 25% soil boundary
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const texture = ((x * 7 + y * 13) % 40) - 20;
        if (x < width * 0.75) {
          data[idx] = Math.max(10, 30 + texture);
          data[idx + 1] = Math.min(240, 140 + texture * 2);
          data[idx + 2] = Math.max(10, 35 + texture);
        } else {
          data[idx] = Math.max(10, 85 + texture);
          data[idx + 1] = Math.max(10, 70 + texture);
          data[idx + 2] = Math.max(10, 45 + texture);
        }
        data[idx + 3] = 255;
      }
    }
    const result = analyzeInWorker(data, width, height, "overview_north");
    expect(result.cropDetected).toBe(true);
    expect(result.greenPct).toBeGreaterThan(60);
    expect(result.hintCode).toBe("ok");
    expect(result.shouldBlockShutter).toBe(false);
    expect(result.bbox).toBeDefined();
  });

  it("accurately detects ripe golden/mature wheat crop canopy", () => {
    const data = new Uint8ClampedArray(pixelCount * 4);
    // Fill with ripe golden wheat color: R=180, G=150, B=50
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 180;
      data[i + 1] = 150;
      data[i + 2] = 50;
      data[i + 3] = 255;
    }
    const result = analyzeInWorker(data, width, height, "closeup_damage");
    expect(result.cropDetected).toBe(true);
    expect(result.greenPct).toBeGreaterThan(60);
    expect(result.hintCode).toBe("ok");
    expect(result.shouldBlockShutter).toBe(false);
  });

  it("correctly identifies non-crop surfaces (e.g. concrete / asphalt)", () => {
    const data = new Uint8ClampedArray(pixelCount * 4);
    // Fill with neutral grey concrete: R=120, G=120, B=120
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 120;
      data[i + 1] = 120;
      data[i + 2] = 120;
      data[i + 3] = 255;
    }
    const result = analyzeInWorker(data, width, height, "overview_north");
    expect(result.cropDetected).toBe(false);
    expect(result.hintCode).toBe("crop_not_detected");
    expect(result.shouldBlockShutter).toBe(true);
  });

  it("detects underexposed / pitch dark environments", () => {
    const data = new Uint8ClampedArray(pixelCount * 4);
    // Very dark frame: R=5, G=8, B=5
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 5;
      data[i + 1] = 8;
      data[i + 2] = 5;
      data[i + 3] = 255;
    }
    const result = analyzeInWorker(data, width, height, "overview_north");
    expect(result.hintCode).toBe("too_dark");
    expect(result.shouldBlockShutter).toBe(true);
  });

  it("detects overexposed / direct solar glare environments", () => {
    const data = new Uint8ClampedArray(pixelCount * 4);
    // Washed out solar glare: R=250, G=252, B=248
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 250;
      data[i + 1] = 252;
      data[i + 2] = 248;
      data[i + 3] = 255;
    }
    const result = analyzeInWorker(data, width, height, "overview_north");
    expect(result.hintCode).toBe("too_bright");
  });

  it("handles charred field conditions under fire damage protocols", () => {
    const data = new Uint8ClampedArray(pixelCount * 4);
    // Charred burn field: R=25, G=25, B=22
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 25;
      data[i + 1] = 25;
      data[i + 2] = 22;
      data[i + 3] = 255;
    }
    const result = analyzeInWorker(data, width, height, "fire_burn");
    expect(result.shouldBlockShutter).toBe(false);
  });

  it("incorporates MobileNet v2 classification verdict when available", () => {
    const data = new Uint8ClampedArray(pixelCount * 4);
    // Ambient lighting non-green
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 100;
      data[i + 1] = 100;
      data[i + 2] = 100;
      data[i + 3] = 255;
    }
    const modelVerdict = {
      label: "corn, maize",
      prob: 0.88,
      saysPlant: true,
    };
    const result = analyzeInWorker(data, width, height, "overview_north", modelVerdict);
    expect(result.cropDetected).toBe(true);
    expect(result.modelLabel).toBe("corn, maize");
    expect(result.modelProb).toBe(0.88);
  });
});
