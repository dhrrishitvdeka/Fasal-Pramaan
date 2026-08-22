import { describe, it, expect } from "vitest";
import { analyzeInWorker } from "@/lib/vision/cv-worker";
import { classifyAgriculturalPixel, rgbToHsv } from "@/lib/vision/realtime-cv";

describe("Realtime Multi-Spectral Agricultural CV Engine & Guidance", () => {
  const width = 32;
  const height = 32;
  const pixelCount = width * height;

  describe("Precision Chromatic & Agronomic Index Classification", () => {
    it("converts RGB to normalized HSV accurately", () => {
      // Pure leaf green
      const [h, s, v] = rgbToHsv(40, 160, 40);
      expect(h).toBeGreaterThanOrEqual(115);
      expect(h).toBeLessThanOrEqual(125);
      expect(s).toBeGreaterThan(0.7);
      expect(v).toBeGreaterThan(0.5);
    });

    it("classifies living vegetative foliage as vegetative canopy", () => {
      const res = classifyAgriculturalPixel(45, 145, 50, 95);
      expect(res.isCanopy).toBe(true);
      expect(res.type).toBe("vegetative");
      expect(res.isSyntheticCandidate).toBe(false);
    });

    it("classifies ripe golden wheat canopy as mature_golden", () => {
      const res = classifyAgriculturalPixel(185, 150, 45, 140);
      expect(res.isCanopy).toBe(true);
      expect(res.type).toBe("mature_golden");
    });

    it("classifies yellow mustard flowers as bloom_yellow", () => {
      const res = classifyAgriculturalPixel(210, 195, 30, 175);
      expect(res.isCanopy).toBe(true);
      expect(res.type).toBe("bloom_yellow");
    });

    it("classifies drought-damaged yellow-brown leaves as scorch", () => {
      const res = classifyAgriculturalPixel(165, 115, 35, 110);
      expect(res.isCanopy).toBe(true);
      expect(res.type).toBe("scorch");
    });

    it("flags hyper-saturated synthetic green plastic as a synthetic candidate", () => {
      const res = classifyAgriculturalPixel(0, 255, 0, 150);
      expect(res.isSyntheticCandidate).toBe(true);
    });

    it("rejects atmospheric sky and road concrete", () => {
      const sky = classifyAgriculturalPixel(110, 170, 240, 165);
      expect(sky.isCanopy).toBe(false);

      const concrete = classifyAgriculturalPixel(130, 130, 130, 130);
      expect(concrete.isCanopy).toBe(false);
    });
  });

  describe("Worker Frame Analysis & Quality Guidance", () => {
    it("accurately detects healthy textured green crop foliage in field framing", () => {
      const data = new Uint8ClampedArray(pixelCount * 4);
      // 75% textured green foliage, 25% soil background with natural micro-texture
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = (y * width + x) * 4;
          const texture = ((x * 11 + y * 17) % 35) - 17;
          if (x < width * 0.75) {
            data[idx] = Math.max(15, 35 + texture);
            data[idx + 1] = Math.min(235, 145 + texture * 2);
            data[idx + 2] = Math.max(15, 40 + texture);
          } else {
            data[idx] = Math.max(20, 95 + texture);
            data[idx + 1] = Math.max(20, 80 + texture);
            data[idx + 2] = Math.max(20, 55 + texture);
          }
          data[idx + 3] = 255;
        }
      }
      const result = analyzeInWorker(data, width, height, "overview_north");
      expect(result.cropDetected).toBe(true);
      expect(result.greenPct).toBeGreaterThan(50);
      expect(result.hintCode).toBe("ok");
      expect(result.shouldBlockShutter).toBe(false);
      expect(result.bbox).toBeDefined();
    });

    it("accurately detects ripe golden wheat / mature paddy canopy", () => {
      const data = new Uint8ClampedArray(pixelCount * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = (y * width + x) * 4;
          const texture = ((x * 7 + y * 13) % 20) - 10;
          data[idx] = 180 + texture;
          data[idx + 1] = 145 + texture;
          data[idx + 2] = 45 + texture;
          data[idx + 3] = 255;
        }
      }
      const result = analyzeInWorker(data, width, height, "closeup_damage");
      expect(result.cropDetected).toBe(true);
      expect(result.greenPct).toBeGreaterThan(60);
      expect(result.hintCode).toBe("ok");
      expect(result.shouldBlockShutter).toBe(false);
    });

    it("suppresses false positives on uniform flat synthetic green plastics/walls", () => {
      const data = new Uint8ClampedArray(pixelCount * 4);
      // Uniform neon green plastic tarp: completely flat (zero micro-texture)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0;
        data[i + 1] = 255;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
      const result = analyzeInWorker(data, width, height, "overview_north");
      expect(result.cropDetected).toBe(false);
      expect(result.hintCode).toBe("crop_not_detected");
      expect(result.shouldBlockShutter).toBe(true);
    });

    it("correctly identifies non-crop neutral surfaces (asphalt/concrete)", () => {
      const data = new Uint8ClampedArray(pixelCount * 4);
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

    it("diagnoses underexposed / pitch dark conditions", () => {
      const data = new Uint8ClampedArray(pixelCount * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 6;
        data[i + 1] = 8;
        data[i + 2] = 5;
        data[i + 3] = 255;
      }
      const result = analyzeInWorker(data, width, height, "overview_north");
      expect(result.hintCode).toBe("too_dark");
      expect(result.shouldBlockShutter).toBe(true);
    });

    it("diagnoses direct solar glare / overexposure", () => {
      const data = new Uint8ClampedArray(pixelCount * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 252;
        data[i + 1] = 254;
        data[i + 2] = 250;
        data[i + 3] = 255;
      }
      const result = analyzeInWorker(data, width, height, "overview_north");
      expect(result.hintCode).toBe("too_bright");
    });

    it("handles charred field conditions under fire damage protocols", () => {
      const data = new Uint8ClampedArray(pixelCount * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 25;
        data[i + 1] = 25;
        data[i + 2] = 22;
        data[i + 3] = 255;
      }
      const result = analyzeInWorker(data, width, height, "fire_burn");
      expect(result.shouldBlockShutter).toBe(false);
    });

    it("incorporates MobileNet v2 plant classification verdict when available", () => {
      const data = new Uint8ClampedArray(pixelCount * 4);
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
});
