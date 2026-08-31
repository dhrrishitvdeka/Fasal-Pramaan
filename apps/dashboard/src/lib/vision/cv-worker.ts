/**
 * CV Worker – Off-main-thread agronomic analysis + optional MobileNet v2.
 *
 * Spawned as `{ type: "module" }` (Next.js/webpack). TF.js and MobileNet must
 * be loaded via ESM `import()`, not `importScripts` (classic-worker only).
 */

import {
  analyzeFrame,
  type CvFrameResult,
  type ModelVerdict,
} from "./cv-core";

export type { CvHintCode, PhenologyType, CvFrameResult, ModelVerdict } from "./cv-core";
export {
  analyzeFrame as analyzeInWorker,
  classifyAgriculturalPixel,
  detectScreenArtifacts,
  rgbToHsv,
  DARK_LUMA_MIN,
} from "./cv-core";

// ---------------------------------------------------------------------------
// TF.js + MobileNet (module-worker safe)
// ---------------------------------------------------------------------------

const TF_ESM = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/+esm";
const TF_UMD = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const MOBILENET_ESM = "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/+esm";
const MOBILENET_UMD =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js";

const PLANT_CLASS_RE =
  /plant|leaf|foliage|flora|crop|grass|hay|straw|tree|branch|flower|blossom|bloom|daisy|sunflower|rose|dahlia|petunia|marigold|produce|vegetable|field|meadow|pasture|farmland|agricultur|maize|corn|ear|wheat|grain|rye|oat|barley|sorghum|millet|rice|paddy|mustard|rapeseed|canola|soybean|cotton|legume|chickpea|lentil|pea|bean|stalk|stem|garden|orchard|vineyard|bush|shrub|herb|moss|lichen|acorn|cardoon|cabbage|broccoli|cauliflower|zucchini|squash|cucumber|artichoke|pepper|greenhouse|flowerpot/i;
const NON_PLANT_RE =
  /person|human|man|woman|boy|girl|face|head|groom|bride|suit|tuxedo|jersey|jean|t-shirt|shirt|sweatshirt|cardigan|sweater|cloak|coat|jacket|pajama|apron|wig|hair|neck|room|wall|window|ceiling|door|desk|table|chair|couch|bed|pillow|quilt|blanket|wardrobe|bookcase|television|monitor|screen|laptop|computer|keyboard|mouse|cellular|phone|telephone|ipod|radio|speaker|cup|mug|bottle|beaker|carton|envelope|binder|notebook|towel|pen|remote|wallet|handbag|backpack|luggage|shoe|sneaker|sock|glove|seat belt|sunglass/i;
const CLASSIFY_INTERVAL_MS = 500;
const CLASSIFY_INPUT = 224;
const CLASSIFY_PROB_MIN = 0.16;
const CLASSIFY_MAX_FAILURES = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tf: any = null;
let tfLoadPromise: Promise<unknown> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mobilenet: any = null;
let mobilenetLoadPromise: Promise<unknown> | null = null;
let lastClassifyAt = 0;
let lastVerdict: ModelVerdict | null = null;
let classifyFailures = 0;
let visionWarned = false;

export type CvModelLoadStatus = "loading" | "ready" | "unavailable";

function warnOnce(msg: string): void {
  if (visionWarned) return;
  visionWarned = true;
  console.warn(`[cv-worker] MobileNet plant classifier unavailable – heuristic-only mode (${msg})`);
}

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

let lastPostedModelStatus: CvModelLoadStatus | null = null;

function postModelStatus(status: CvModelLoadStatus, label?: string): void {
  if (!inWorkerContext()) return;
  if (lastPostedModelStatus === status) return;
  lastPostedModelStatus = status;
  try {
    (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
      type: "model_status",
      status,
      ...(label ? { label } : {}),
    });
  } catch {
    // ignore
  }
}

function workerGlobal(): Record<string, unknown> {
  return (typeof self !== "undefined" ? self : globalThis) as unknown as Record<string, unknown>;
}

async function importEsm(url: string): Promise<unknown> {
  return import(/* webpackIgnore: true */ url);
}

function tryImportScripts(url: string): void {
  const g = workerGlobal() as { importScripts?: (u: string) => void };
  if (typeof g.importScripts === "function") {
    g.importScripts(url);
  }
}

function ensureTf(): Promise<unknown> {
  if (tf) return Promise.resolve(tf);
  if (tfLoadPromise) return tfLoadPromise;
  tfLoadPromise = (async () => {
    try {
      const g = workerGlobal();
      if (g.tf) {
        tf = g.tf;
        try {
          await tf.ready?.();
        } catch {
          // ignore
        }
        return tf;
      }
      try {
        const mod = (await importEsm(TF_ESM)) as { default?: unknown } & Record<string, unknown>;
        const maybeTf = mod.default ?? mod;
        if (maybeTf && typeof (maybeTf as { ready?: unknown }).ready === "function") {
          await (maybeTf as { ready: () => Promise<void> }).ready();
          tf = maybeTf;
          return tf;
        }
      } catch {
        // fall through to classic UMD
      }
      tryImportScripts(TF_UMD);
      if (g.tf) {
        tf = g.tf;
        try {
          await tf.ready?.();
        } catch {
          // ignore
        }
        return tf;
      }
    } catch {
      // ignore
    }
    return null;
  })();
  return tfLoadPromise;
}

function ensureMobilenet(): Promise<unknown> {
  if (mobilenet) return Promise.resolve(mobilenet);
  if (mobilenetLoadPromise) return mobilenetLoadPromise;
  postModelStatus("loading");
  mobilenetLoadPromise = (async () => {
    try {
      const loadedTf = await ensureTf();
      if (!loadedTf) throw new Error("tfjs unavailable");
      const g = workerGlobal();
      let api = g.mobilenet as { load?: (opts: unknown) => Promise<unknown> } | undefined;
      if (!api || typeof api.load !== "function") {
        try {
          const mod = (await importEsm(MOBILENET_ESM)) as {
            default?: { load?: (opts: unknown) => Promise<unknown> };
            load?: (opts: unknown) => Promise<unknown>;
          };
          api = (mod.default && typeof mod.default.load === "function" ? mod.default : mod) as {
            load?: (opts: unknown) => Promise<unknown>;
          };
        } catch {
          tryImportScripts(MOBILENET_UMD);
          api = g.mobilenet as { load?: (opts: unknown) => Promise<unknown> } | undefined;
        }
      }
      if (!api || typeof api.load !== "function") throw new Error("mobilenet global missing");
      const model = await api.load({ version: 2, alpha: 0.5 });
      if (!model || typeof (model as { classify?: unknown }).classify !== "function") {
        throw new Error("mobilenet classify missing");
      }
      mobilenet = model;
      postModelStatus("ready");
      return model;
    } catch (err) {
      warnOnce(String(err));
      postModelStatus("unavailable", String(err));
      return null;
    }
  })();
  return mobilenetLoadPromise;
}

if (inWorkerContext()) {
  void ensureMobilenet();
}

let cachedSrcCanvas: OffscreenCanvas | null = null;
let cachedDstCanvas: OffscreenCanvas | null = null;
let cachedBitmapCanvas: OffscreenCanvas | null = null;

function buildClassifyCanvas(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): OffscreenCanvas | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: any = (self as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
    if (typeof Ctor !== "function") return null;
    if (!(width > 0 && height > 0) || data.length < width * height * 4) return null;

    if (!cachedSrcCanvas) {
      cachedSrcCanvas = new Ctor(width, height) as OffscreenCanvas;
    } else if (cachedSrcCanvas.width !== width || cachedSrcCanvas.height !== height) {
      cachedSrcCanvas.width = width;
      cachedSrcCanvas.height = height;
    }

    const srcCtx = cachedSrcCanvas.getContext("2d") as unknown as CanvasRenderingContext2D | null;
    if (!srcCtx) return null;
    const srcImage = srcCtx.createImageData(width, height);
    if (!srcImage) return null;
    srcImage.data.set(data.subarray(0, Math.min(data.length, width * height * 4)));
    srcCtx.putImageData(srcImage, 0, 0);

    if (!cachedDstCanvas) {
      cachedDstCanvas = new Ctor(CLASSIFY_INPUT, CLASSIFY_INPUT) as OffscreenCanvas;
    }
    const dstCtx = cachedDstCanvas.getContext("2d") as unknown as CanvasRenderingContext2D | null;
    if (!dstCtx) return null;
    dstCtx.clearRect(0, 0, CLASSIFY_INPUT, CLASSIFY_INPUT);
    dstCtx.drawImage(cachedSrcCanvas as unknown as CanvasImageSource, 0, 0, CLASSIFY_INPUT, CLASSIFY_INPUT);
    return cachedDstCanvas;
  } catch {
    return null;
  }
}

async function classifySample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<ModelVerdict | null> {
  if (classifyFailures >= CLASSIFY_MAX_FAILURES) return lastVerdict;
  if (!mobilenet) {
    void ensureMobilenet();
    return lastVerdict;
  }
  const now = Date.now();
  if (now - lastClassifyAt < CLASSIFY_INTERVAL_MS) return lastVerdict;
  lastClassifyAt = now;
  try {
    const canvas = buildClassifyCanvas(data, width, height);
    if (!canvas) throw new Error("classify canvas unavailable");
    let preds: Array<{ className?: unknown; probability?: unknown }> = [];
    try {
      preds = await mobilenet.classify(canvas, 3);
    } catch {
      const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D | null;
      const imageData = ctx ? ctx.getImageData(0, 0, CLASSIFY_INPUT, CLASSIFY_INPUT) : null;
      if (!imageData) throw new Error("classify input unavailable");
      preds = await mobilenet.classify(imageData, 3);
    }
    classifyFailures = 0;
    if (!preds || preds.length === 0) {
      lastVerdict = null;
      return null;
    }
    const first = preds[0] ?? {};
    const topLabel = typeof first.className === "string" ? first.className : null;
    let topProb = Number(first.probability ?? 0);
    if (!Number.isFinite(topProb)) topProb = 0;
    let matchedLabel: string | null = null;
    let matchedProb: number | null = null;
    let isExplicitNonPlant = false;

    if (topLabel && NON_PLANT_RE.test(topLabel)) {
      isExplicitNonPlant = true;
    }

    for (const p of preds.slice(0, 3)) {
      const cls = typeof p?.className === "string" ? p.className : "";
      const prob = Number(p?.probability ?? NaN);
      if (!cls || !Number.isFinite(prob)) continue;
      if (prob >= CLASSIFY_PROB_MIN && PLANT_CLASS_RE.test(cls)) {
        matchedLabel = cls;
        matchedProb = prob;
        break;
      }
    }
    const verdict: ModelVerdict = {
      label: matchedLabel ?? topLabel,
      prob: matchedLabel != null ? matchedProb : topProb,
      saysPlant: !isExplicitNonPlant && matchedLabel != null,
    };
    lastVerdict = verdict;
    return verdict;
  } catch (err) {
    classifyFailures += 1;
    if (classifyFailures >= CLASSIFY_MAX_FAILURES) warnOnce(String(err));
    return lastVerdict;
  }
}

// ---------------------------------------------------------------------------
// Worker message loop — must NOT require importScripts (module workers omit it)
// ---------------------------------------------------------------------------

type WorkerRequest =
  | { id: string; angleId?: string; bitmap: ImageBitmap }
  | { id: string; angleId?: string; width: number; height: number; buffer: ArrayBuffer };

type WorkerResponse = {
  id: string;
  result?: CvFrameResult;
  error?: string;
};

if (inWorkerContext()) {
  (self as unknown as { onmessage: (e: MessageEvent<WorkerRequest>) => void }).onmessage = async (
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
          const w = 64;
          const h = 64;
          let data: Uint8ClampedArray | null = null;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const OffscreenCanvasCtor: any = (self as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
            if (OffscreenCanvasCtor) {
              if (!cachedBitmapCanvas) {
                cachedBitmapCanvas = new OffscreenCanvasCtor(w, h) as OffscreenCanvas;
              }
              const ctx = cachedBitmapCanvas.getContext("2d") as unknown as CanvasRenderingContext2D | null;
              if (ctx) {
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, w, h);
                const imageData = ctx.getImageData(0, 0, w, h);
                data = imageData.data;
              }
            }
          } catch {
            // ignore
          }
          if (data) {
            const verdict = await classifySample(data, w, h);
            result = analyzeFrame(data, w, h, angleId, verdict);
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
        const clamped = new Uint8ClampedArray(buffer);
        const verdict = await classifySample(clamped, width, height);
        result = analyzeFrame(clamped, width, height, angleId, verdict);
      }

      const resp: WorkerResponse = { id, result: result ?? undefined };
      (self as unknown as { postMessage: (msg: unknown) => void }).postMessage(resp);
    } catch (err) {
      const resp: WorkerResponse = { id, error: String(err) };
      (self as unknown as { postMessage: (msg: unknown) => void }).postMessage(resp);
    }
  };
}
