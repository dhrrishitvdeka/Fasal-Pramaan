/**
 * CV Worker – off-main-thread agronomic analysis (no TF.js / no CDN models).
 * Live shutter lock uses OpenCV-style heuristics in cv-core.analyzeFrame.
 */

import { analyzeFrame, type CvFrameResult } from "./cv-core";

export type { CvHintCode, PhenologyType, CvFrameResult, ModelVerdict } from "./cv-core";
export {
  analyzeFrame as analyzeInWorker,
  classifyAgriculturalPixel,
  detectScreenArtifacts,
  rgbToHsv,
  DARK_LUMA_MIN,
} from "./cv-core";

export type CvModelLoadStatus = "ready";

function inWorkerContext(): boolean {
  try {
    return (
      typeof self !== "undefined" &&
      typeof (self as unknown as { postMessage?: unknown }).postMessage === "function" &&
      typeof document === "undefined"
    );
  } catch {
    return false;
  }
}

function postReady(): void {
  if (!inWorkerContext()) return;
  try {
    (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
      type: "model_status",
      status: "ready",
    });
  } catch {
    // ignore
  }
}

let cachedBitmapCanvas: OffscreenCanvas | null = null;

type WorkerRequest =
  | { id: string; angleId?: string; bitmap: ImageBitmap }
  | { id: string; angleId?: string; width: number; height: number; buffer: ArrayBuffer };

if (inWorkerContext()) {
  postReady();
  (self as unknown as { onmessage: (e: MessageEvent<WorkerRequest>) => void }).onmessage = (
    e: MessageEvent<WorkerRequest>,
  ) => {
    const req = e.data as WorkerRequest;
    const id = (req as { id?: string })?.id ?? "";
    try {
      let result: CvFrameResult | null = null;

      if ((req as { bitmap?: unknown }).bitmap) {
        const bitmap = (req as { bitmap: ImageBitmap }).bitmap;
        try {
          const angleId = (req as { angleId?: string }).angleId;
          const w = Math.max(1, Math.min(bitmap.width || 128, 128));
          const h = Math.max(1, Math.min(bitmap.height || 128, 128));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const OffscreenCanvasCtor: any = (self as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
          if (OffscreenCanvasCtor) {
            if (!cachedBitmapCanvas) {
              cachedBitmapCanvas = new OffscreenCanvasCtor(w, h) as OffscreenCanvas;
            } else if (cachedBitmapCanvas.width !== w || cachedBitmapCanvas.height !== h) {
              cachedBitmapCanvas.width = w;
              cachedBitmapCanvas.height = h;
            }
            const ctx = cachedBitmapCanvas.getContext("2d") as unknown as CanvasRenderingContext2D | null;
            if (ctx) {
              ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, w, h);
              const imageData = ctx.getImageData(0, 0, w, h);
              result = analyzeFrame(imageData.data, w, h, angleId);
            }
          }
        } finally {
          try {
            bitmap.close();
          } catch {
            // ignore
          }
        }
      } else if ((req as { buffer?: unknown }).buffer) {
        const { width, height, buffer, angleId } = req as {
          width: number;
          height: number;
          buffer: ArrayBuffer;
          angleId?: string;
        };
        result = analyzeFrame(new Uint8ClampedArray(buffer), width, height, angleId);
      }

      (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
        id,
        result,
      });
    } catch (err) {
      (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
        id,
        error: err instanceof Error ? err.message : "cv-worker failed",
      });
    }
  };
}
