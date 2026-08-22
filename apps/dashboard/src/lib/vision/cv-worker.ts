/**
 * CV Worker – off-main-thread 64x64 sampling + heuristic analysis.
 * Tries to load TF.js from CDN plus @tensorflow-models/mobilenet v2.1.1
 * (MobileNet v2, alpha 0.5 – weights auto-downloaded free from tfhub /
 * storage.googleapis.com) for real pretrained plant/crop classification;
 * falls back cleanly to heuristic-only if TF.js/model unavailable (offline,
 * CSP block, load failure) – never throws, logs at most once.
 * Returns the same CvFrameResult shape as realtime-cv.ts but computes bbox
 * via contour of greenPixels (min/max x/y of green pixels → normalized bbox).
 * Variance → blurScore mapping matches main thread.
 */

export type CvHintCode =
  | "ok"
  | "crop_not_detected"
  | "too_dark"
  | "too_bright"
  | "too_close"
  | "too_far"
  | "hold_steady"
  | "center_crop";

export type CvFrameResult = {
  cropDetected: boolean;
  greenPct: number;
  luma: number | null;
  blurScore: number | null;
  hintCode: CvHintCode;
  hintEn: string;
  hintHi: string;
  cropOnlyOk: boolean;
  shouldBlockShutter: boolean;
  bbox?: { x: number; y: number; w: number; h: number } | null;
  modelLabel?: string | null;
  modelProb?: number | null;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hintFor(
  scores: { totalCropPct: number; greenPct: number; luma: number | null; blur: number | null },
  angleId?: string,
): { code: CvHintCode; en: string; hi: string; block: boolean } {
  const { totalCropPct, luma, blur } = scores;
  if (luma != null && luma < 14)
    return {
      code: "too_dark",
      en: "Too dark — move to brighter light or turn on torch",
      hi: "बहुत अँधेरा — तेज़ रोशनी में जाएँ या टॉर्च चालू करें",
      block: true,
    };
  if (luma != null && luma > 92)
    return {
      code: "too_bright",
      en: "Too bright — avoid direct sun glare",
      hi: "बहुत तेज़ रोशनी — सीधी धूप की चमक हटाएँ",
      block: false,
    };
  // fire_burn peril relax – charred field may have low green; use relaxed threshold 8 vs 12
  const isCloseup = angleId === "closeup_damage";
  const isFireRelax =
    angleId === "fire_burn" ||
    angleId === "wide_field" ||
    (angleId != null && angleId.includes("fire"));
  const cropThreshold = isCloseup || isFireRelax ? 8 : 12;
  if (totalCropPct < cropThreshold) {
    return {
      code: "crop_not_detected",
      en: "No crop in frame — center the crop or point directly at foliage",
      hi: "फसल फ्रेम में नहीं — फसल को बीच में रखें या कैमरे को सीधे पत्तियों पर लाएँ",
      block: true,
    };
  }
  if (blur != null && blur > 0 && blur < 20) {
    return {
      code: "hold_steady",
      en: "Hold steady — camera is moving or blurry",
      hi: "कैमरा स्थिर रखें — तस्वीर धुंधली आ रही है",
      block: false,
    };
  }
  if (totalCropPct > 88 && !isCloseup) {
    return {
      code: "too_close",
      en: "Too close — step back slightly to capture full area",
      hi: "बहुत पास — सीमा दिखाने के लिए थोड़ा पीछे हटें",
      block: false,
    };
  }
  return {
    code: "ok",
    en: "Good framing & focus — ready to capture",
    hi: "सही फ्रेम और फोकस — कैप्चर के लिए तैयार",
    block: false,
  };
}

// ---------------------------------------------------------------------------
// TF.js micro model setup – try CDN, fallback to heuristic
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tf: any = null;
let tfLoadPromise: Promise<unknown> | null = null;

function ensureTf(): Promise<unknown> {
  if (tf) return Promise.resolve(tf);
  if (tfLoadPromise) return tfLoadPromise;
  tfLoadPromise = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g: any = typeof self !== "undefined" ? self : globalThis;
      if (typeof g.importScripts === "function") {
        // Try to load TF.js micro bundle from CDN
        g.importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4/dist/tf.min.js");
        const maybeTf = g.tf;
        if (maybeTf) {
          try {
            await maybeTf.ready();
          } catch {
            // ignore ready failure
          }
          tf = maybeTf;
          return tf;
        }
      } else {
        // In non-worker contexts importScripts not available; try dynamic import fallback (no-op if fails)
        try {
          // @ts-expect-error – optional CDN ESM import, may fail offline
          const mod = await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4/dist/tf.min.js");
          tf = (mod as unknown as { tf?: unknown }).tf ?? mod;
          if (tf && typeof tf.ready === "function") await tf.ready();
          return tf;
        } catch {
          return null;
        }
      }
    } catch {
      // network or CSP failure – fallback to heuristic
    }
    return null;
  })();
  return tfLoadPromise;
}

// Kick off load (non-blocking) in worker context
if (typeof self !== "undefined") {
  void ensureTf();
}

// ---------------------------------------------------------------------------
// MobileNet v2 plant/crop classifier – CDN model, clean heuristic degradation
// ---------------------------------------------------------------------------

const MOBILENET_CDN =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js";
const PLANT_CLASS_RE =
  /plant|leaf|crop|grass|tree|flower|produce|vegetable|field|agricultur|maize|wheat|rice|paddy|corn/i;
const CLASSIFY_INTERVAL_MS = 500;
const CLASSIFY_INPUT = 224;
const CLASSIFY_PROB_MIN = 0.18;
const CLASSIFY_MAX_FAILURES = 3;

export type ModelVerdict = { label: string | null; prob: number | null; saysPlant: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mobilenet: any = null;
let mobilenetLoadPromise: Promise<unknown> | null = null;
let lastClassifyAt = 0;
let lastVerdict: ModelVerdict | null = null;
let classifyFailures = 0;
let visionWarned = false;

function warnOnce(msg: string): void {
  if (visionWarned) return;
  visionWarned = true;
  console.warn(`[cv-worker] MobileNet plant classifier unavailable – heuristic-only mode (${msg})`);
}

export type CvModelLoadStatus = "loading" | "ready" | "unavailable";

/** True only inside a real Worker global (no DOM document on main thread). */
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

/** Fire-and-forget status transition to the main thread; dedupes repeats. Never throws. */
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
    // ignore – status signal is best-effort
  }
}

function ensureMobilenet(): Promise<unknown> {
  if (mobilenet) return Promise.resolve(mobilenet);
  if (mobilenetLoadPromise) return mobilenetLoadPromise;
  postModelStatus("loading");
  mobilenetLoadPromise = (async () => {
    try {
      const loadedTf = await ensureTf();
      if (!loadedTf) throw new Error("tfjs unavailable");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g: any = typeof self !== "undefined" ? self : globalThis;
      let api = g.mobilenet;
      if (!api || typeof api.load !== "function") {
        if (typeof g.importScripts === "function") {
          g.importScripts(MOBILENET_CDN);
          api = g.mobilenet;
        } else {
          try {
            // @ts-expect-error – optional CDN ESM import, may fail offline
            const mod = await import("https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js");
            api =
              ((mod as unknown as { mobilenet?: unknown }).mobilenet as unknown) ??
              ((mod as unknown as { default?: unknown }).default as unknown) ??
              mod;
          } catch {
            // network or CSP failure – fallback to heuristic
          }
        }
      }
      if (!api || typeof api.load !== "function") throw new Error("mobilenet global missing");
      const model = await api.load({ version: 2, alpha: 0.5 });
      if (!model || typeof model.classify !== "function") throw new Error("mobilenet classify missing");
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

// Kick off load immediately on worker start (fire-and-forget) – weights download
// begins while the farmer reads guidance, status transitions posted to main thread.
if (inWorkerContext()) {
  void ensureMobilenet();
}

/**
 * Build a 224x224 canvas by upscaling the sampled frame (e.g. 64x64) –
 * MobileNet needs ≥~128px input. Returns null if OffscreenCanvas/2d ctx
 * unavailable; caller degrades to cached verdict (heuristic-only).
 */
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
    const src = new Ctor(width, height) as OffscreenCanvas;
    const srcCtx = src.getContext("2d") as unknown as CanvasRenderingContext2D | null;
    if (!srcCtx) return null;
    const srcImage = srcCtx.createImageData(width, height);
    if (!srcImage) return null;
    srcImage.data.set(data.subarray(0, Math.min(data.length, width * height * 4)));
    srcCtx.putImageData(srcImage, 0, 0);
    const dst = new Ctor(CLASSIFY_INPUT, CLASSIFY_INPUT) as OffscreenCanvas;
    const dstCtx = dst.getContext("2d") as unknown as CanvasRenderingContext2D | null;
    if (!dstCtx) return null;
    dstCtx.drawImage(src as unknown as CanvasImageSource, 0, 0, CLASSIFY_INPUT, CLASSIFY_INPUT);
    return dst;
  } catch {
    return null;
  }
}

/**
 * Classify at most once per 500ms; intermediate frames reuse the cached
 * verdict with fresh luma/green numbers computed by callers. Never throws.
 */
async function classifySample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<ModelVerdict | null> {
  if (classifyFailures >= CLASSIFY_MAX_FAILURES) return lastVerdict;
  if (!mobilenet) {
    void ensureMobilenet(); // background prewarm – never block a frame on weights download
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
      // OffscreenCanvas not accepted by this tfjs backend build → ImageData fallback
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
      saysPlant: matchedLabel != null,
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
// Core analysis – exported for main-thread fallback / testing
// ---------------------------------------------------------------------------

/**
 * Analyze a sampled frame buffer (already at sampled resolution, typically 64x64)
 * using heuristic green detection. If TF.js loaded, attempts TF-based
 * segmentation first, otherwise uses heuristic. Returns CvFrameResult with
 * bbox computed via contour of green pixels (min/max x/y → normalized).
 *
 * `modelVerdict` is the (throttled/cached) MobileNet classification for this
 * frame; final cropDetected = heuristicGreenOK || modelSaysPlant (union).
 *
 * @param data - RGBA flat buffer (Uint8ClampedArray) at width×height
 * @param width - sampled width
 * @param height - sampled height
 * @param angleId - canonical angle id for fire_burn relax thresholds
 * @param modelVerdict - cached MobileNet plant verdict (null when unavailable)
 */
export function analyzeInWorker(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  angleId?: string,
  modelVerdict?: ModelVerdict | null,
): CvFrameResult {
  // Try TF.js path if available – green vegetation segmentation via tensor ops
  // If TF fails for any reason, fall through to heuristic
  if (tf) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t: any = tf;
      // Create tensor from rgba data: we only need RGB channels
      // Use tf.tidy to avoid leaks
      const greenPctTf = t.tidy(() => {
        // Convert flat Uint8 to tensor of shape [h*w,4] then slice RGB
        // This is a lightweight segmentation fallback: g > 60 && g > r+10 && g > b+10
        // Done via tf ops to leverage possible GPU/WASM backend if available
        const flat = t.tensor(data, [width * height * 4], "int32");
        const reshaped = flat.reshape([height, width, 4]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rgb = (reshaped as any).slice([0, 0, 0], [height, width, 3]) as any;
        const r = rgb.slice([0, 0, 0], [height, width, 1]);
        const g = rgb.slice([0, 0, 1], [height, width, 1]);
        const b = rgb.slice([0, 0, 2], [height, width, 1]);
        const gGt60 = g.greater(60);
        const gGtR = g.greater(r.add(10));
        const gGtB = g.greater(b.add(10));
        const mask = gGt60.logicalAnd(gGtR).logicalAnd(gGtB);
        const count = mask.sum().dataSync()[0] as number;
        const total = width * height;
        return total ? Math.round((count / total) * 100) : 0;
      });
      // If TF path succeeded, we still need luma/blur/bbox via heuristic loop
      // so we store the TF greenPct and continue to compute rest heuristically below
      // To avoid double computation, we will use greenPctTf as greenPct and skip recount
      // Mark success by returning early with TF-derived greenPct (still compute bbox heuristically)
      // If we reach here without throwing, proceed to heuristic but inject Tf greenPct
      // We'll compute full result below but override greenPct
      const heuristic = analyzeHeuristic(data, width, height, angleId, greenPctTf, modelVerdict);
      return heuristic;
    } catch {
      // TF segmentation failed – fallback to pure heuristic
    }
  }

  return analyzeHeuristic(data, width, height, angleId, undefined, modelVerdict);
}

function analyzeHeuristic(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  angleId?: string,
  forcedGreenPct?: number,
  modelVerdict?: ModelVerdict | null,
): CvFrameResult {
  let sumLuma = 0;
  let greenPixels = 0;
  let ripePixels = 0;
  let charredPixels = 0;
  let total = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let gradientSum = 0;
  let gradientSumSq = 0;
  let gradientCount = 0;

  const isFireRelax =
    angleId === "fire_burn" ||
    angleId === "wide_field" ||
    (angleId != null && angleId.includes("fire"));

  // data is RGBA flat; width*height pixels
  const pixelCount = width * height;
  const len = Math.min(data.length, pixelCount * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      if (idx + 2 >= len) break;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      sumLuma += luma;
      total += 1;

      // 1. Green vegetative foliage (ExG / chromatic excess green)
      const isGreen = g > 45 && (2 * g > r + b + 10 || (g > r + 6 && g > b + 6));
      // 2. Ripe / golden / dry mature crop canopy (wheat heads, mustard, ripe paddy, dry straw)
      const isRipe =
        r > 75 && g > 65 && b < 140 && r >= g - 20 && r <= g + 70 && r + g > 2 * b + 15;
      // 3. Charred / burn scar field matter (fire peril)
      const isCharred =
        isFireRelax &&
        luma >= 8 &&
        luma <= 45 &&
        Math.abs(r - g) < 18 &&
        Math.abs(g - b) < 18 &&
        r < 75 &&
        g < 75 &&
        b < 75;

      if (isGreen) greenPixels += 1;
      if (isRipe) ripePixels += 1;
      if (isCharred) charredPixels += 1;

      if (isGreen || isRipe || isCharred) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      // 2D Spatial Edge Gradient for true Laplacian-like sharpness/blur estimation
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const rightLuma =
          0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6];
        const downLuma =
          0.299 * data[idx + width * 4] +
          0.587 * data[idx + width * 4 + 1] +
          0.114 * data[idx + width * 4 + 2];
        const grad = Math.abs(rightLuma - luma) + Math.abs(downLuma - luma);
        gradientSum += grad;
        gradientSumSq += grad * grad;
        gradientCount += 1;
      }
    }
  }

  const luma = total ? Math.round((sumLuma / total / 255) * 100) : null;
  const greenPct = forcedGreenPct != null ? forcedGreenPct : total ? Math.round((greenPixels / total) * 100) : 0;
  const ripePct = total ? Math.round((ripePixels / total) * 100) : 0;
  const charredPct = total ? Math.round((charredPixels / total) * 100) : 0;

  // Total canopy coverage: green + golden mature + charred
  const totalCropPct = clamp(
    Math.round(greenPct + ripePct * 0.85 + (isFireRelax ? charredPct : 0)),
    0,
    100,
  );

  const gradVar =
    gradientCount > 0
      ? gradientSumSq / gradientCount - Math.pow(gradientSum / gradientCount, 2)
      : 0;
  const blurScore = clamp(Math.round((Math.sqrt(Math.max(0, gradVar)) / 25) * 100), 0, 100);

  const hint = hintFor({ totalCropPct, greenPct, luma, blur: blurScore }, angleId);
  const isCloseup = angleId === "closeup_damage";
  const cropThreshold = isCloseup || isFireRelax ? 8 : 12;

  // Union of signals: multi-spectral canopy coverage OR pretrained MobileNet plant class
  const heuristicCanopyOk = totalCropPct >= cropThreshold && luma != null && luma >= 14;
  const modelSaysPlant = !!modelVerdict?.saysPlant;
  const cropDetected = heuristicCanopyOk || modelSaysPlant;

  let bbox: { x: number; y: number; w: number; h: number } | null = null;
  if (cropDetected) {
    if ((greenPixels > 0 || ripePixels > 0 || charredPixels > 0) && maxX >= minX) {
      // contour of cropPixels → normalized bbox
      const x = minX / width;
      const y = minY / height;
      const w = (maxX - minX + 1) / width;
      const h = (maxY - minY + 1) / height;
      // clamp to [0,1]
      bbox = {
        x: clamp(x, 0, 1),
        y: clamp(y, 0, 1),
        w: clamp(w, 0.15, 1 - clamp(x, 0, 1)),
        h: clamp(h, 0.15, 1 - clamp(y, 0, 1)),
      };
    } else {
      // Fallback centered 60% box if no contour but still detected (rare)
      bbox = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    }
  }

  const shouldBlockShutter = hint.block && !isFireRelax && !cropDetected;

  return {
    cropDetected,
    greenPct: totalCropPct,
    luma,
    blurScore,
    hintCode: hint.code,
    hintEn: hint.en,
    hintHi: hint.hi,
    cropOnlyOk: cropDetected,
    shouldBlockShutter,
    bbox,
    modelLabel: modelVerdict?.label ?? null,
    modelProb: modelVerdict?.prob ?? null,
  };
}

// ---------------------------------------------------------------------------
// Worker message handling – does 64x64 sampling off main thread when given ImageBitmap
// ---------------------------------------------------------------------------

type WorkerRequest =
  | { id: string; angleId?: string; bitmap: ImageBitmap }
  | { id: string; angleId?: string; width: number; height: number; buffer: ArrayBuffer };

type WorkerResponse = {
  id: string;
  result?: CvFrameResult;
  error?: string;
};

// Only register handler in worker context (not during SSR / main-thread import)
if (
  typeof self !== "undefined" &&
  typeof (self as unknown as { postMessage?: unknown }).postMessage === "function" &&
  typeof (self as unknown as { importScripts?: unknown }).importScripts === "function"
) {
  // Worker global – install onmessage
  (self as unknown as { onmessage: (e: MessageEvent<WorkerRequest>) => void }).onmessage = async (
    e: MessageEvent<WorkerRequest>,
  ) => {
    const req = e.data as WorkerRequest;
    const id = (req as { id?: string })?.id ?? "";
    try {
      await ensureTf();
      let result: CvFrameResult | null = null;

      if ((req as { bitmap?: unknown }).bitmap) {
        const bitmap = (req as { bitmap: ImageBitmap }).bitmap;
        const angleId = (req as { angleId?: string }).angleId;
        // 64x64 sampling off main thread via OffscreenCanvas
        const w = 64;
        const h = 64;
        let data: Uint8ClampedArray | null = null;
        try {
          // OffscreenCanvas is available in workers
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const OffscreenCanvasCtor: any = (self as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
          if (OffscreenCanvasCtor) {
            const off = new OffscreenCanvasCtor(w, h) as OffscreenCanvas;
            const ctx = off.getContext("2d") as unknown as CanvasRenderingContext2D | null;
            if (ctx) {
              ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, w, h);
              const imageData = ctx.getImageData(0, 0, w, h);
              data = imageData.data;
            }
          }
        } catch {
          // fallback to createImageData path
        }
        // Fallback if OffscreenCanvas not available – try to use bitmap width/height 64 sample via heuristic on raw bitmap?
        // If still no data, return heuristic with empty
        try {
          bitmap.close();
        } catch {
          // ignore
        }
        if (data) {
          const verdict = await classifySample(data, w, h);
          result = analyzeInWorker(data, w, h, angleId, verdict);
        } else {
          // No OffscreenCanvas – return null to trigger main-thread fallback
          result = null;
        }
      } else if ((req as { buffer?: unknown }).buffer) {
        const { width, height, buffer, angleId } = req as { width: number; height: number; buffer: ArrayBuffer; angleId?: string };
        const clamped = new Uint8ClampedArray(buffer);
        // If buffer is larger than 64x64, we treat it as already sampled; but if caller sends larger, we could downsample
        // For correctness, if width*height*4 === clamped.length we analyze directly
        const verdict = await classifySample(clamped, width, height);
        result = analyzeInWorker(clamped, width, height, angleId, verdict);
      }

      const resp: WorkerResponse = { id, result: result ?? undefined };
      (self as unknown as { postMessage: (msg: unknown) => void }).postMessage(resp);
    } catch (err) {
      const resp: WorkerResponse = { id, error: String(err) };
      (self as unknown as { postMessage: (msg: unknown) => void }).postMessage(resp);
    }
  };
}


