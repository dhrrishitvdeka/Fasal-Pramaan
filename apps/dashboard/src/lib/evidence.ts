import { ROUTE_CONFIG, type Peril } from "./claim-routing";

export interface EvidenceImageInput {
  imageUrl?: string;
  /** Presence marker for callers whose frames live outside this module (e.g. uploaded bytes). */
  present?: boolean;
  angleId?: string;
  angleType?: string;
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
  missingAngles?: string[];
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
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256FromDataUrl(dataUrl: string): Promise<string> {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return sha256Hex(bytes);
}

export function isUnusableLighting(score?: number | null): boolean {
  if (score == null) return false;
  return score < 15 || score > 98;
}

export function measureLightingScore(imageData: ImageData): number {
  const data = imageData.data;
  const step = 8;
  let totalLuma = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalLuma += 0.299 * r + 0.587 * g + 0.114 * b;
    count += 1;
  }
  if (!count) return 0;
  const meanLuma = totalLuma / count;
  const score = 100 - Math.abs(meanLuma - 128) * (100 / 128);
  return Math.max(0, Math.min(100, Math.round(score)));
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

/**
 * Single source of truth for angle-coverage scoring: an angle counts only when a
 * usable frame exists for it (image present and not explicitly failed on quality),
 * deduplicated across frames of the same angle.
 *
 * `qualityPassed === false` marks a frame the capture pipeline measured as unusable;
 * `null/undefined` means quality was simply not measured, so presence still counts.
 */
export function computeAngleCoverage(
  images: EvidenceImageInput[],
  requiredAngles: readonly string[] = REQUIRED_ANGLES,
): { covered: number; total: number; missing: string[] } {
  const reqSet = new Set(requiredAngles);
  const coveredAngles = new Set<string>();
  for (const img of images) {
    const id = img.angleId || img.angleType;
    if (!id || !reqSet.has(id)) continue;
    const present = img.present != null ? Boolean(img.present) : Boolean(img.imageUrl);
    if (!present) continue;
    if (img.qualityPassed === false) continue;
    coveredAngles.add(id);
  }
  return {
    covered: coveredAngles.size,
    total: requiredAngles.length,
    missing: requiredAngles.filter((angle) => !coveredAngles.has(angle)),
  };
}

/** Honest evidence preview from captured signals. Unified with server-side pipeline. */
export function computeEvidencePreview(
  images: EvidenceImageInput[],
  peril?: string | null,
): EvidencePreview {
  const reqAngles: readonly string[] =
    (peril && ROUTE_CONFIG[peril as Peril]?.requiredAngles) || REQUIRED_ANGLES;
  const { covered: distinctUsableRequired, total, missing } = computeAngleCoverage(images, reqAngles);
  const coverageScore = Math.min(100, Math.round((distinctUsableRequired / Math.max(1, total)) * 100));

  const qualityParts = images
    .map((img) => {
      const parts = [img.blurScore, img.lightingScore].filter((n): n is number => typeof n === "number");
      if (!parts.length) return null;
      return parts.reduce((a, b) => a + b, 0) / parts.length;
    })
    .filter((n): n is number => n != null);
  const qualityMean = mean(qualityParts);
  const qualityScore = qualityMean == null ? 0 : Math.round(qualityMean);
  const qualityAvailable = qualityMean != null;

  const realHashes = images.filter((img) => isRealSha256(img.sha256)).length;
  const integrityScore = images.length === 0 ? 0 : Math.round((realHashes / images.length) * 100);

  const gpsOk = images.filter((img) => img.lat != null && img.lon != null);
  const contextScore = images.length === 0 ? 0 : Math.round((gpsOk.length / images.length) * 100);

  const overallConfidence = Math.round(
    0.4 * qualityScore + 0.3 * coverageScore + 0.2 * contextScore + 0.1 * integrityScore
  );

  return {
    qualityScore,
    coverageScore,
    contextScore,
    integrityScore,
    overallConfidence,
    missingAngles: missing,
    qualityNotes: qualityAvailable
      ? `Quality from measured blur/lighting on ${qualityParts.length} image(s).`
      : "Quality not measured — left at 0 rather than estimated.",
    coverageNotes: `${distinctUsableRequired}/${total} required captured angle(s).`,
    contextNotes:
      gpsOk.length === images.length && images.length > 0
        ? "All frames include authentic GPS coordinates."
        : gpsOk.length === 0
          ? "No authentic GPS fix on captured frames."
          : `${gpsOk.length} of ${images.length} frames have authentic GPS coordinates.`,
    integrityNotes: realHashes === images.length && images.length > 0
      ? "SHA-256 digest verified for every frame."
      : realHashes === 0
        ? "No real SHA-256 digest stored."
        : `${realHashes} of ${images.length} frames have a verified SHA-256 digest.`,
  };
}
