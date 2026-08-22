/**
 * CV Worker – Off-main-thread Multi-Spectral Agricultural Vision & Usability Analyzer.
 *
 * Implements:
 * 1. Multi-spectral agronomic color indices (ExG, GLI, VARI, ExR, HSV biological bands).
 * 2. Organic micro-texture & spatial gradient analysis to reject synthetic green plastics, clothes, and walls.
 * 3. 2D Modified Laplacian sharpness / blur assessment.
 * 4. Pretrained MobileNet v2 classification on offscreen canvas.
 * 5. Bounding box computation from canopy contour.
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

/**
 * Fast RGB to HSV normalized conversion.
 */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max / 255;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      h = ((b - r) / d + 2) * 60;
    } else {
      h = ((r - g) / d + 4) * 60;
    }
  }
  return [h, s, v];
}

function hintFor(
  scores: {
    totalCanopyPct: number;
    vegetativePct: number;
    luma: number | null;
    blur: number | null;
    glareRatio: number;
    syntheticRatio: number;
  },
  angleId?: string,
): { code: CvHintCode; en: string; hi: string; block: boolean } {
  const { totalCanopyPct, luma, blur, glareRatio, syntheticRatio } = scores;

  if (luma != null && luma < 14) {
    return {
      code: "too_dark",
      en: "Too dark — move into brighter light or turn on torch",
      hi: "बहुत अँधेरा — तेज़ रोशनी में जाएँ या टॉर्च चालू करें",
      block: true,
    };
  }

  if ((luma != null && luma > 90) || glareRatio > 0.28) {
    return {
      code: "too_bright",
      en: "Too bright — avoid direct solar glare and lens reflection",
      hi: "बहुत तेज़ रोशनी — सीधी धूप की चमक और लेंस रिफ्लेक्शन से बचें",
      block: false,
    };
  }

  const isCloseup = angleId === "closeup_damage";
  const isFireRelax =
    angleId === "fire_burn" ||
    angleId === "wide_field" ||
    (angleId != null && angleId.includes("fire"));

  const minCanopyThreshold = isCloseup ? 15 : isFireRelax ? 8 : 12;

  // Synthetic surface rejection
  if (syntheticRatio > 0.40 && totalCanopyPct < 25) {
    return {
      code: "crop_not_detected",
      en: "Non-crop surface detected — aim directly at natural field crops",
      hi: "फसल नहीं पहचानी गई — कैमरे को प्राकृतिक फसल व पत्तियों पर लाएँ",
      block: true,
    };
  }

  if (totalCanopyPct < minCanopyThreshold) {
    return {
      code: "crop_not_detected",
      en: "No crop in frame — center the crop or point directly at foliage",
      hi: "फसल फ्रेम में नहीं — फसल को बीच में रखें या कैमरे को सीधे पत्तियों पर लाएँ",
      block: true,
    };
  }

  if (blur != null && blur > 0 && blur < 18) {
    return {
      code: "hold_steady",
      en: "Hold steady — camera is moving or out of focus",
      hi: "कैमरा स्थिर रखें — तस्वीर धुंधली आ रही है",
      block: false,
    };
  }

  if (totalCanopyPct > 92 && !isCloseup) {
    return {
      code: "too_close",
      en: "Too close — step back slightly to capture plot boundary",
      hi: "बहुत पास — खेत की सीमा दिखाने के लिए थोड़ा पीछे हटें",
      block: false,
    };
  }

  if (isCloseup && totalCanopyPct < 22) {
    return {
      code: "too_far",
      en: "Move closer to capture damaged plant organs in detail",
      hi: "पौधे के प्रभावित हिस्से को स्पष्ट दिखाने के लिए पास जाएँ",
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

/**
 * Classifies an RGB pixel into agricultural canopy categories.
 */
function classifyPixel(
  r: number,
  g: number,
  b: number,
  luma: number,
  isFirePeril: boolean = false,
): {
  isCanopy: boolean;
  type: "vegetative" | "mature_golden" | "bloom_yellow" | "scorch" | "charred" | "none";
  isSyntheticCandidate: boolean;
} {
  const sum = r + g + b;
  if (sum === 0) return { isCanopy: false, type: "none", isSyntheticCandidate: false };

  const rn = r / sum;
  const gn = g / sum;
  const bn = b / sum;

  const exg = 2 * gn - rn - bn;
  const exr = 1.4 * rn - gn;
  const gli = (2 * g - r - b) / (2 * g + r + b);

  const [h, s, v] = rgbToHsv(r, g, b);

  // Background suppressions:
  // Sky
  if (b > r + 24 && b > g - 4 && luma > 60 && h >= 185 && h <= 250) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false };
  }

  // Neutral Gray Asphalt/Concrete
  const maxDiff = Math.max(r, g, b) - Math.min(r, g, b);
  if (maxDiff < 14 && luma >= 35 && luma <= 210) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false };
  }

  // Skin tone
  if (r > g && g > b && r - g > 12 && r - g < 95 && g - b > 5 && s > 0.15 && s < 0.65 && h < 38) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false };
  }

  // Synthetic hyper-saturation
  const isHyperSaturatedSynthetic = (g > 200 && (r < 45 || b < 45)) || (s > 0.93 && h >= 70 && h <= 165);

  // Vegetative
  const isVegetative =
    (exg > 0.06 || (gli > 0.04 && g > r && g > b)) &&
    h >= 68 &&
    h <= 165 &&
    s >= 0.16 &&
    v >= 0.14 &&
    v <= 0.96;

  if (isVegetative) {
    return {
      isCanopy: !isHyperSaturatedSynthetic,
      type: isHyperSaturatedSynthetic ? "none" : "vegetative",
      isSyntheticCandidate: isHyperSaturatedSynthetic,
    };
  }

  if (isHyperSaturatedSynthetic) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: true };
  }

  // Bloom Yellow
  const isBloomYellow =
    h >= 42 &&
    h <= 64 &&
    s >= 0.38 &&
    v >= 0.50 &&
    r > 140 &&
    g > 130 &&
    b < 120 &&
    Math.abs(r - g) <= 22;

  if (isBloomYellow) {
    return { isCanopy: true, type: "bloom_yellow", isSyntheticCandidate: false };
  }

  // Drought Scorch
  const isScorch =
    h >= 16 &&
    h <= 40 &&
    s >= 0.18 &&
    s <= 0.85 &&
    v >= 0.16 &&
    v <= 0.85 &&
    r > g + 25 &&
    r > b + 25;

  if (isScorch) {
    return { isCanopy: true, type: "scorch", isSyntheticCandidate: false };
  }

  // Mature Golden Grain
  const isMatureGolden =
    (exr > 0.03 || (r > b + 25 && g > b + 15)) &&
    h >= 30 &&
    h <= 68 &&
    s >= 0.18 &&
    s <= 0.90 &&
    v >= 0.22 &&
    v <= 0.95 &&
    r >= g - 25 &&
    r <= g + 45;

  if (isMatureGolden) {
    return { isCanopy: true, type: "mature_golden", isSyntheticCandidate: false };
  }

  // Charred Fire
  const isCharred =
    isFirePeril &&
    luma >= 6 &&
    luma <= 48 &&
    maxDiff < 18 &&
    r < 80 &&
    g < 80 &&
    b < 80 &&
    s <= 0.30;

  if (isCharred) {
    return { isCanopy: true, type: "charred", isSyntheticCandidate: false };
  }

  return { isCanopy: false, type: "none", isSyntheticCandidate: false };
}

// ---------------------------------------------------------------------------
// TF.js micro model setup
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
        g.importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4/dist/tf.min.js");
        const maybeTf = g.tf;
        if (maybeTf) {
          try {
            await maybeTf.ready();
          } catch {
            // ignore
          }
          tf = maybeTf;
          return tf;
        }
      }
    } catch {
      // ignore
    }
    return null;
  })();
  return tfLoadPromise;
}

if (typeof self !== "undefined") {
  void ensureTf();
}

// ---------------------------------------------------------------------------
// MobileNet v2 plant/crop classifier
// ---------------------------------------------------------------------------

const MOBILENET_CDN =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js";
const PLANT_CLASS_RE =
  /plant|leaf|crop|grass|tree|flower|produce|vegetable|field|agricultur|maize|wheat|rice|paddy|corn|grain|barley|sorghum|mustard|rapeseed|sunflower|soybean|cotton|legume|chickpea|lentil/i;
const CLASSIFY_INTERVAL_MS = 500;
const CLASSIFY_INPUT = 224;
const CLASSIFY_PROB_MIN = 0.16;
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

if (inWorkerContext()) {
  void ensureMobilenet();
}

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
// Core Worker Analysis
// ---------------------------------------------------------------------------

export function analyzeInWorker(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  angleId?: string,
  modelVerdict?: ModelVerdict | null,
): CvFrameResult {
  let sumLuma = 0;
  let vegetativeCount = 0;
  let matureGoldenCount = 0;
  let bloomYellowCount = 0;
  let scorchCount = 0;
  let charredCount = 0;
  let syntheticCount = 0;
  let glareCount = 0;
  let total = 0;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  let laplacianSum = 0;
  let laplacianCount = 0;

  const isFireRelax =
    angleId === "fire_burn" ||
    angleId === "wide_field" ||
    (angleId != null && angleId.includes("fire"));

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

      if (r > 248 && g > 248 && b > 248) {
        glareCount += 1;
      }

      const classification = classifyPixel(r, g, b, luma, isFireRelax);

      if (classification.isCanopy) {
        if (classification.type === "vegetative") vegetativeCount += 1;
        else if (classification.type === "mature_golden") matureGoldenCount += 1;
        else if (classification.type === "bloom_yellow") bloomYellowCount += 1;
        else if (classification.type === "scorch") scorchCount += 1;
        else if (classification.type === "charred") charredCount += 1;

        if (classification.isSyntheticCandidate) {
          syntheticCount += 1;
        }

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else if (classification.isSyntheticCandidate) {
        syntheticCount += 1;
      }

      // 2D 4-point Laplacian convolution
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const lumaCenter = luma;
        const lumaLeft = 0.299 * data[idx - 4] + 0.587 * data[idx - 3] + 0.114 * data[idx - 2];
        const lumaRight = 0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6];
        const lumaUp =
          0.299 * data[idx - width * 4] + 0.587 * data[idx - width * 4 + 1] + 0.114 * data[idx - width * 4 + 2];
        const lumaDown =
          0.299 * data[idx + width * 4] + 0.587 * data[idx + width * 4 + 1] + 0.114 * data[idx + width * 4 + 2];

        const lap = Math.abs(4 * lumaCenter - (lumaLeft + lumaRight + lumaUp + lumaDown));
        laplacianSum += lap;
        laplacianCount += 1;
      }
    }
  }

  const luma = total ? Math.round((sumLuma / total / 255) * 100) : null;
  const vegetativePct = total ? Math.round((vegetativeCount / total) * 100) : 0;
  const matureGoldenPct = total ? Math.round((matureGoldenCount / total) * 100) : 0;
  const bloomYellowPct = total ? Math.round((bloomYellowCount / total) * 100) : 0;
  const scorchPct = total ? Math.round((scorchCount / total) * 100) : 0;
  const charredPct = total ? Math.round((charredCount / total) * 100) : 0;
  const glareRatio = total ? glareCount / total : 0;
  const syntheticRatio = total ? syntheticCount / total : 0;

  // Organic Micro-Texture Penalty for uniform flat artificial surfaces
  const meanLaplacian = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;
  const isFlatArtificialSurface = (vegetativePct > 20 || syntheticCount > 15) && meanLaplacian < 1.8 && syntheticRatio > 0.35;

  const rawCanopyPct =
    vegetativePct * (isFlatArtificialSurface ? 0.1 : 1.0) +
    matureGoldenPct * 0.90 +
    bloomYellowPct * 0.90 +
    scorchPct * 0.75 +
    (isFireRelax ? charredPct : 0);

  const totalCanopyPct = clamp(Math.round(rawCanopyPct), 0, 100);
  const blurScore = clamp(Math.round((meanLaplacian / 12) * 100), 0, 100);

  const hint = hintFor(
    {
      totalCanopyPct,
      vegetativePct,
      luma,
      blur: blurScore,
      glareRatio,
      syntheticRatio,
    },
    angleId,
  );

  const isCloseup = angleId === "closeup_damage";
  const minCanopyThreshold = isCloseup ? 15 : isFireRelax ? 8 : 12;

  const heuristicCanopyOk = totalCanopyPct >= minCanopyThreshold && luma != null && luma >= 14 && !isFlatArtificialSurface;
  const modelSaysPlant = !!modelVerdict?.saysPlant;
  const cropDetected = heuristicCanopyOk || modelSaysPlant;

  let bbox: { x: number; y: number; w: number; h: number } | null = null;
  if (cropDetected && maxX >= minX && maxY >= minY) {
    const rawX = minX / width;
    const rawY = minY / height;
    const x = clamp(rawX, 0, 0.85);
    const y = clamp(rawY, 0, 0.85);
    const rawW = (maxX - minX + 1) / width;
    const rawH = (maxY - minY + 1) / height;
    const bw = clamp(rawW, 0.15, 1 - x);
    const bh = clamp(rawH, 0.15, 1 - y);
    bbox = { x, y, w: bw, h: bh };
  } else if (cropDetected) {
    bbox = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
  }

  const shouldBlockShutter = hint.block && !isFireRelax && !cropDetected;

  return {
    cropDetected,
    greenPct: totalCanopyPct,
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
// Worker message loop
// ---------------------------------------------------------------------------

type WorkerRequest =
  | { id: string; angleId?: string; bitmap: ImageBitmap }
  | { id: string; angleId?: string; width: number; height: number; buffer: ArrayBuffer };

type WorkerResponse = {
  id: string;
  result?: CvFrameResult;
  error?: string;
};

if (
  typeof self !== "undefined" &&
  typeof (self as unknown as { postMessage?: unknown }).postMessage === "function" &&
  typeof (self as unknown as { importScripts?: unknown }).importScripts === "function"
) {
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
        try {
          const angleId = (req as { angleId?: string }).angleId;
          const w = 64;
          const h = 64;
          let data: Uint8ClampedArray | null = null;
          try {
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
            // ignore
          }
          if (data) {
            const verdict = await classifySample(data, w, h);
            result = analyzeInWorker(data, w, h, angleId, verdict);
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
