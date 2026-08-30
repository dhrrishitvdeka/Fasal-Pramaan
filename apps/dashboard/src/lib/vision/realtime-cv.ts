/**
 * Realtime Computer Vision & Agricultural Usability Analyzer for Fasal-Pramaan.
 *
 * Live preview, captured stills, and the module worker all run `analyzeFrame`
 * from cv-core so shutter locks cannot disagree with the still check.
 */

export type {
  CvHintCode,
  PhenologyType,
  CvFrameResult,
} from "./cv-core";
export {
  rgbToHsv,
  detectScreenArtifacts,
  classifyAgriculturalPixel,
  analyzeFrame,
  DARK_LUMA_MIN,
  FIRE_DARK_LUMA_MIN,
  CROP_LOCK_SCORE,
} from "./cv-core";

import { analyzeFrame, type CvFrameResult } from "./cv-core";

export type CropPhenologyBreakdown = {
  vegetativePct: number;
  matureGoldenPct: number;
  bloomYellowPct: number;
  scorchDroughtPct: number;
  charredFirePct: number;
  syntheticRejectionPct: number;
};

const SAMPLE_W = 64;
const SAMPLE_H = 64;

export type CvModelLoadStatus = "loading" | "ready" | "unavailable";

let cvWorker: Worker | null = null;
let cvWorkerInitFailed = false;
let currentModelStatus: CvModelLoadStatus = "loading";
const modelStatusListeners = new Set<(status: CvModelLoadStatus) => void>();

export function getModelStatus(): CvModelLoadStatus {
  return currentModelStatus;
}

export function onModelStatus(listener: (status: CvModelLoadStatus) => void): () => void {
  modelStatusListeners.add(listener);
  return () => {
    modelStatusListeners.delete(listener);
  };
}

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function getScratchCanvas(
  w: number,
  h: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  if (!scratchCanvas) {
    scratchCanvas = document.createElement("canvas");
  }
  if (scratchCanvas.width !== w) scratchCanvas.width = w;
  if (scratchCanvas.height !== h) scratchCanvas.height = h;
  if (!scratchCtx) {
    scratchCtx = scratchCanvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  }
  if (!scratchCtx) return null;
  return { canvas: scratchCanvas, ctx: scratchCtx };
}

function sampleToImageData(
  source: CanvasImageSource,
  sw: number,
  sh: number,
): { data: Uint8ClampedArray; width: number; height: number } | null {
  const scratch = getScratchCanvas(SAMPLE_W, SAMPLE_H);
  if (!scratch) return null;
  const { ctx } = scratch;
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, SAMPLE_W, SAMPLE_H);
  const imageData = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
  return { data: imageData.data, width: SAMPLE_W, height: SAMPLE_H };
}

function getCvWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (cvWorker) return cvWorker;
  if (cvWorkerInitFailed) return null;
  try {
    cvWorker = new Worker(new URL("./cv-worker.ts", import.meta.url), { type: "module" });
    cvWorker.addEventListener("message", (e: MessageEvent) => {
      if (e.data && typeof e.data === "object" && (e.data as { type?: string }).type === "model_status") {
        const s = (e.data as { status?: CvModelLoadStatus }).status;
        if (s === "loading" || s === "ready" || s === "unavailable") {
          currentModelStatus = s;
          modelStatusListeners.forEach((fn) => {
            try {
              fn(s);
            } catch {
              // ignore
            }
          });
        }
      }
    });
    cvWorker.onerror = (err) => {
      console.warn("[realtime-cv] CV Worker errored, falling back to main-thread analysis:", err);
      cvWorkerInitFailed = true;
      cvWorker = null;
      if (currentModelStatus === "loading") {
        currentModelStatus = "unavailable";
        modelStatusListeners.forEach((fn) => {
          try {
            fn("unavailable");
          } catch {
            // ignore
          }
        });
      }
    };
    return cvWorker;
  } catch (err) {
    console.warn("[realtime-cv] Could not spawn CV worker, using main-thread fallback:", err);
    cvWorkerInitFailed = true;
    cvWorker = null;
    currentModelStatus = "unavailable";
    return null;
  }
}

export function ensureCvWorker(): Worker | null {
  return getCvWorker();
}

export function terminateCvWorker(): void {
  if (cvWorker) {
    try {
      cvWorker.terminate();
    } catch {
      // ignore
    }
    cvWorker = null;
  }
}

/**
 * Main-thread video frame analyzer (fallback). Same 64×64 + analyzeFrame path
 * as the worker so live vs fallback cannot disagree.
 */
export function analyzeVideoFrame(video: HTMLVideoElement, angleId?: string): CvFrameResult | null {
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const sampled = sampleToImageData(video, vw, vh);
    if (!sampled) return null;
    return analyzeFrame(sampled.data, sampled.width, sampled.height, angleId);
  } catch {
    return null;
  }
}

let nextJobId = 1;

export async function analyzeVideoFrameAsync(
  video: HTMLVideoElement,
  angleId?: string,
): Promise<CvFrameResult | null> {
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    const scratch = getScratchCanvas(SAMPLE_W, SAMPLE_H);
    if (!scratch) return analyzeVideoFrame(video, angleId);

    const { ctx } = scratch;
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const imageData = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    const buffer = imageData.data.buffer.slice(0);

    const worker = getCvWorker();
    if (!worker) {
      return analyzeFrame(new Uint8ClampedArray(buffer), SAMPLE_W, SAMPLE_H, angleId);
    }

    const id = nextJobId++;
    try {
      const result = await new Promise<CvFrameResult | null>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
        };
        const onMessage = (e: MessageEvent) => {
          const data = e.data as { id?: number; result?: CvFrameResult; error?: string };
          if (!data || data.id !== id) return;
          if (settled) return;
          settled = true;
          cleanup();
          if (data.error) resolve(null);
          else resolve(data.result ?? null);
        };
        const onError = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(null);
        };
        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onError);
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(null);
        }, 900);
        worker.postMessage({ id, width: SAMPLE_W, height: SAMPLE_H, buffer, angleId }, [buffer]);
      });
      if (result) return result;
      return analyzeVideoFrame(video, angleId);
    } catch {
      return analyzeVideoFrame(video, angleId);
    }
  } catch {
    return analyzeVideoFrame(video, angleId);
  }
}

/**
 * Analyze a still dataUrl with the same 64×64 + analyzeFrame path as live
 * preview (includes screen detection — previously skipped on stills).
 */
export async function analyzeDataUrl(dataUrl: string, angleId?: string): Promise<CvFrameResult | null> {
  if (typeof document === "undefined" || !dataUrl.startsWith("data:image/")) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const nw = img.naturalWidth || img.width;
        const nh = img.naturalHeight || img.height;
        if (!nw || !nh) return resolve(null);
        const sampled = sampleToImageData(img, nw, nh);
        if (!sampled) return resolve(null);
        resolve(analyzeFrame(sampled.data, sampled.width, sampled.height, angleId));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
