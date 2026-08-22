/**
 * Realtime CV stub for webapp viewfinder.
 * Runs fully on-device (canvas sampling). Not a full DINOv2 model — heuristic guidance
 * that mirrors the production CV contract and feeds Saathi in parallel.
 * Pluggable: swap `analyzeFrame` impl with TF.js / ONNX worker later without changing callers.
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
  greenPct: number; // 0-100
  luma: number | null; // 0-100
  blurScore: number | null; // 0-100 heuristic
  hintCode: CvHintCode;
  hintEn: string;
  hintHi: string;
  cropOnlyOk: boolean;
  shouldBlockShutter: boolean;
  bbox?: { x: number; y: number; w: number; h: number } | null;
  /** MobileNet v2 (CDN, worker path only) matched/top class label – null when model unavailable */
  modelLabel?: string | null;
  /** Probability of modelLabel (0-1) – null when model unavailable */
  modelProb?: number | null;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function hintFor(scores: { greenPct: number; luma: number | null; blur: number | null }, angleId?: string): { code: CvHintCode; en: string; hi: string; block: boolean } {
  const { greenPct, luma, blur } = scores;
  if (luma != null && luma < 12) return { code: "too_dark", en: "Too dark — move to brighter light or turn on torch", hi: "बहुत अँधेरा — तेज़ रोशनी में जाएँ", block: true };
  if (luma != null && luma > 92) return { code: "too_bright", en: "Too bright — avoid direct sun glare", hi: "बहुत तेज़ रोशनी — धूप की चमक हटाएँ", block: false };
  if (blur != null && blur < 35) return { code: "hold_steady", en: "Hold steady — image looks blurry", hi: "स्थिर रखें — धुंधली लग रही है", block: false };
  // fire/burn can have low green (charred) — relax for those angles if caller passes angleId
  const isCloseup = angleId === "closeup_damage";
  const greenThreshold = isCloseup ? 8 : 14;
  if (greenPct < greenThreshold) {
    return { code: "crop_not_detected", en: "Crop not in frame — move closer and center the crop", hi: "फसल फ्रेम में नहीं — पास जाएँ और बीच में रखें", block: true };
  }
  if (greenPct > 78 && !isCloseup) {
    return { code: "too_close", en: "Too close — step back to include field border", hi: "बहुत पास — सीमा दिखाने को पीछे हटें", block: false };
  }
  return { code: "ok", en: "Good framing — ready to capture", hi: "सही फ्रेम — कैप्चर के लिए तैयार", block: false };
}

/**
 * Estimate realtime signals from current video frame.
 * Safe to call at ~2-4 fps; creates tiny 64x64 canvas.
 */
export function analyzeVideoFrame(video: HTMLVideoElement, angleId?: string): CvFrameResult | null {
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const canvas = document.createElement("canvas");
    const w = Math.min(vw, 64);
    const h = Math.min(vh, 64);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let sumLuma = 0;
    let greenPixels = 0;
    let total = 0;
    // simple Laplacian-like variance for blur proxy
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = (r + g + b) / 3;
      sumLuma += luma;
      sum += luma;
      sumSq += luma * luma;
      total += 1;
      // crude vegetation green check
      if (g > 60 && g > r + 10 && g > b + 10) greenPixels += 1;
    }
    const luma = total ? Math.round((sumLuma / total / 255) * 100) : null;
    const greenPct = total ? Math.round((greenPixels / total) * 100) : 0;
    const variance = total ? sumSq / total - (sum / total) * (sum / total) : 0;
    // map variance 0..4000 to 0..100
    const blurScore = clamp(Math.round((variance / 40) * 10), 0, 100);
    const hint = hintFor({ greenPct, luma, blur: blurScore }, angleId);
    const cropDetected = greenPct >= (angleId === "closeup_damage" ? 8 : 14) && luma != null && luma >= 12;
    // bbox stub centered 60% for now — real model would output detection box
    const bbox = cropDetected ? { x: 0.2, y: 0.2, w: 0.6, h: 0.6 } : null;

    // fire_burn can have low green but still cropOnlyOk if luma ok — relax block
    const isFire = angleId === "wide_field" && greenPct < 8; // placeholder: caller should pass peril separately
    const shouldBlockShutter = hint.block && !isFire;

    return {
      cropDetected,
      greenPct,
      luma,
      blurScore,
      hintCode: hint.code,
      hintEn: hint.en,
      hintHi: hint.hi,
      cropOnlyOk: cropDetected,
      shouldBlockShutter,
      bbox,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Worker-backed async path – off-main-thread 64x64 sampling + analysis
// ---------------------------------------------------------------------------

let cvWorker: Worker | null = null;
let cvWorkerInitFailed = false;

// ---------------------------------------------------------------------------
// MobileNet warmup status – fed by cv-worker "model_status" messages
// ---------------------------------------------------------------------------

export type CvModelStatus = "unknown" | "loading" | "ready" | "unavailable";

let modelStatus: CvModelStatus = "unknown";
type ModelStatusListener = (status: CvModelStatus) => void;
const modelStatusListeners = new Set<ModelStatusListener>();

function setModelStatus(next: CvModelStatus): void {
  if (modelStatus === next) return;
  modelStatus = next;
  modelStatusListeners.forEach((cb) => {
    try {
      cb(next);
    } catch {
      // ignore listener errors
    }
  });
}

/** Latest MobileNet warmup state reported by the CV worker. */
export function getModelStatus(): CvModelStatus {
  return modelStatus;
}

/** Subscribe to model warmup transitions. Emits current state immediately. Returns unsubscribe. */
export function onModelStatus(cb: ModelStatusListener): () => void {
  modelStatusListeners.add(cb);
  cb(modelStatus);
  return () => {
    modelStatusListeners.delete(cb);
  };
}

/**
 * Ensure singleton CV worker. Spawned via `new Worker(new URL("./cv-worker.ts", import.meta.url))`.
 * Falls back to null if Worker unsupported (SSR, older browsers, CSP blocks).
 */
export function ensureCvWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (typeof Worker === "undefined") return null;
  if (cvWorker) return cvWorker;
  if (cvWorkerInitFailed) return null;
  try {
    cvWorker = new Worker(new URL("./cv-worker.ts", import.meta.url));
    cvWorker.onmessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; status?: string } | undefined | null;
      if (!data || data.type !== "model_status") return;
      if (data.status === "loading" || data.status === "ready" || data.status === "unavailable") {
        setModelStatus(data.status);
      }
    };
    cvWorker.onerror = () => {
      cvWorkerInitFailed = true;
      setModelStatus("unavailable");
      try {
        cvWorker?.terminate();
      } catch {
        // ignore
      }
      cvWorker = null;
    };
    return cvWorker;
  } catch {
    cvWorkerInitFailed = true;
    setModelStatus("unavailable");
    return null;
  }
}

/**
 * Async variant that delegates to cv-worker.ts off the main thread.
 * - Tries ImageBitmap → worker does 64x64 sampling via OffscreenCanvas (true off-main-thread sampling)
 * - Falls back to main-thread 64x64 ImageData → worker analyzes buffer off-thread
 * - Finally falls back to synchronous analyzeVideoFrame if worker unavailable or times out
 */
export async function analyzeVideoFrameAsync(
  video: HTMLVideoElement,
  angleId?: string,
): Promise<CvFrameResult | null> {
  const worker = ensureCvWorker();
  if (!worker) return analyzeVideoFrame(video, angleId);

  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    // Prefer ImageBitmap path – sampling happens inside worker via OffscreenCanvas
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(video);
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const result = await new Promise<CvFrameResult | null>((resolve) => {
          let settled = false;
          let timer: ReturnType<typeof setTimeout> | null = null;
          const cleanup = () => {
            worker.removeEventListener("message", onMessage);
            worker.removeEventListener("error", onError);
            if (timer) clearTimeout(timer);
          };
          const onMessage = (e: MessageEvent) => {
            const data = e.data as { id?: string; result?: CvFrameResult; error?: string } | undefined;
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
          try {
            worker.postMessage({ id, bitmap, angleId }, [bitmap as unknown as Transferable]);
          } catch {
            if (!settled) {
              settled = true;
              cleanup();
              resolve(null);
            }
          }
        });
        if (result) return result;
        // fall through to buffer path if worker returned null (e.g., OffscreenCanvas unavailable)
      } catch {
        // createImageBitmap failed – fall through
      }
    }

    // Fallback: main-thread creates 64x64 sampling, worker does analysis off-thread
    try {
      const w = Math.min(vw, 64);
      const h = Math.min(vh, 64);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return analyzeVideoFrame(video, angleId);
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const buffer = imageData.data.buffer.slice(0) as ArrayBuffer;
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const result = await new Promise<CvFrameResult | null>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          if (timer) clearTimeout(timer);
        };
        const onMessage = (e: MessageEvent) => {
          const data = e.data as { id?: string; result?: CvFrameResult; error?: string } | undefined;
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
        try {
          worker.postMessage({ id, width: w, height: h, buffer, angleId }, [buffer]);
        } catch {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(null);
          }
        }
      });
      if (result) return result;
    } catch {
      // ignore buffer path failure
    }

    return analyzeVideoFrame(video, angleId);
  } catch {
    return analyzeVideoFrame(video, angleId);
  }
}

/**
 * Analyze a still dataUrl (after capture) for gate UX before upload.
 */
export async function analyzeDataUrl(dataUrl: string, angleId?: string): Promise<CvFrameResult | null> {
  if (typeof document === "undefined" || !dataUrl.startsWith("data:image/")) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = Math.min(img.naturalWidth || img.width, 256);
      const h = Math.min(img.naturalHeight || img.height, 256);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const data = ctx.getImageData(0, 0, w, h).data;
        let sumLuma = 0;
        let greenPixels = 0;
        let total = 0;
        let sum = 0;
        let sumSq = 0;
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luma = (r + g + b) / 3;
          sumLuma += luma;
          sum += luma;
          sumSq += luma * luma;
          total += 1;
          if (g > 60 && g > r + 10 && g > b + 10) greenPixels += 1;
        }
        const luma = total ? Math.round((sumLuma / total / 255) * 100) : null;
        const greenPct = total ? Math.round((greenPixels / total) * 100) : 0;
        const variance = total ? sumSq / total - (sum / total) * (sum / total) : 0;
        const blurScore = clamp(Math.round((variance / 40) * 10), 0, 100);
        const hint = hintFor({ greenPct, luma, blur: blurScore }, angleId);
        resolve({
          cropDetected: greenPct >= (angleId === "closeup_damage" ? 8 : 14) && luma != null && luma >= 12,
          greenPct,
          luma,
          blurScore,
          hintCode: hint.code,
          hintEn: hint.en,
          hintHi: hint.hi,
          cropOnlyOk: greenPct >= 8,
          shouldBlockShutter: false,
          bbox: null,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

