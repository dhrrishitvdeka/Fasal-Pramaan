export interface EvidenceImageInput {
  imageUrl?: string;
  qualityPassed?: boolean;
  blurScore?: number | null;
  lightingScore?: number | null;
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
  sha256?: string | null;
}

export interface EvidencePreview {
  qualityScore: number;
  coverageScore: number;
  contextScore: number;
  integrityScore: number;
  overallConfidence: number;
  qualityNotes?: string;
  coverageNotes?: string;
  contextNotes?: string;
  integrityNotes?: string;
}

export const REQUIRED_ANGLES = [
  "wide_field",
  "left_context",
  "mid_canopy",
  "right_context",
  "closeup_damage",
] as const;

export function isRealSha256(hash: string | null | undefined): boolean {
  return typeof hash === "string" && /^[0-9a-f]{64}$/i.test(hash.trim());
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) return "";
  const source = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256FromDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return "";
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return "";
  const b64 = dataUrl.slice(comma + 1);
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return sha256Hex(bytes);
  } catch {
    return "";
  }
}

export const UNUSABLE_LIGHTING_MAX = 12;

export function measureLightingScore(imageData: ImageData): number {
  const pixels = imageData.data;
  let sum = 0;
  let count = 0;
  const stride = 16;
  for (let i = 0; i < pixels.length; i += 4 * stride) {
    sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    count += 1;
  }
  if (!count) return 0;
  return Math.round((sum / count / 255) * 100);
}

export function isUnusableLighting(score?: number | null): boolean {
  return score != null && Number.isFinite(score) && score < UNUSABLE_LIGHTING_MAX;
}

export async function measureLightingFromDataUrl(dataUrl: string): Promise<number | undefined> {
  if (typeof document === "undefined" || !dataUrl.startsWith("data:image/")) return undefined;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx || !canvas.width || !canvas.height) {
        resolve(undefined);
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        resolve(measureLightingScore(ctx.getImageData(0, 0, canvas.width, canvas.height)));
      } catch {
        resolve(undefined);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}

export function qualityPassedFromSignals(opts: {
  lightingScore?: number | null;
  blurScore?: number | null;
}): boolean {
  const lighting = opts.lightingScore;
  const blur = opts.blurScore;
  if (lighting == null && blur == null) return false;
  if (lighting != null && (lighting < 20 || lighting > 95)) return false;
  if (blur != null && blur < 40) return false;
  return true;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Honest local evidence preview from captured signals only. Never invents scores. */
export function computeEvidencePreview(images: EvidenceImageInput[]): EvidencePreview {
  const usable = images.filter((img) => Boolean(img.imageUrl) && img.qualityPassed);
  const coverageScore = Math.round((usable.length / REQUIRED_ANGLES.length) * 100);

  const qualityParts = images
    .map((img) => {
      const parts = [img.blurScore, img.lightingScore].filter((n): n is number => n != null);
      if (!parts.length) return null;
      return parts.reduce((a, b) => a + b, 0) / parts.length;
    })
    .filter((n): n is number => n != null);
  const qualityMean = mean(qualityParts);
  const qualityScore = qualityMean == null ? 0 : Math.round(qualityMean);
  const qualityAvailable = qualityMean != null;

  const gpsOk = images.filter(
    (img) => img.lat != null && img.lon != null && img.accuracyM != null && img.accuracyM > 0
  );
  const contextScore = images.length === 0 ? 0 : Math.round((gpsOk.length / images.length) * 100);

  const allHashed = images.length > 0 && images.every((img) => isRealSha256(img.sha256));
  const integrityScore = allHashed ? 100 : 0;

  const overallConfidence = Math.round(
    0.4 * qualityScore + 0.3 * coverageScore + 0.2 * contextScore + 0.1 * integrityScore
  );

  return {
    qualityScore,
    coverageScore,
    contextScore,
    integrityScore,
    overallConfidence,
    qualityNotes: qualityAvailable
      ? `Quality from measured blur/lighting on ${qualityParts.length} image(s).`
      : "Quality not measured — left at 0 rather than estimated.",
    coverageNotes: `${usable.length} of ${REQUIRED_ANGLES.length} usable captured angles.`,
    contextNotes:
      gpsOk.length === images.length && images.length > 0
        ? "All frames include a real GPS fix."
        : gpsOk.length === 0
          ? "No authentic GPS fix on captured frames."
          : `${gpsOk.length} of ${images.length} frames have a real GPS fix.`,
    integrityNotes: allHashed
      ? "SHA-256 digest present for every frame."
      : "Integrity is 0 because one or more frames lack a real SHA-256 digest.",
  };
}
