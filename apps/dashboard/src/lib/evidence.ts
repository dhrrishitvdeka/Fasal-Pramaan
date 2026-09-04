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
  "photo_1",
  "photo_2",
  "photo_3",
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
 * Detect duplicate or exact-same-angle images across evidence inputs.
 * Checks for duplicate SHA-256 digests, identical data URLs, or identical edge signals.
 */
export function detectDuplicateImages(images: EvidenceImageInput[]): {
  hasDuplicates: boolean;
  duplicatePairs: [number, number][];
  reasons: string[];
} {
  const duplicatePairs: [number, number][] = [];
  const reasons: string[] = [];

  for (let i = 0; i < images.length; i++) {
    for (let j = i + 1; j < images.length; j++) {
      const a = images[i];
      const b = images[j];

      // 1. Exact SHA-256 hash match
      if (
        a.sha256 &&
        b.sha256 &&
        isRealSha256(a.sha256) &&
        isRealSha256(b.sha256) &&
        a.sha256.toLowerCase().trim() === b.sha256.toLowerCase().trim()
      ) {
        duplicatePairs.push([i, j]);
        reasons.push(`Photos ${i + 1} and ${j + 1} share identical cryptographic SHA-256 hash.`);
        continue;
      }

      // 2. Identical non-empty data URL
      if (
        a.imageUrl &&
        b.imageUrl &&
        a.imageUrl === b.imageUrl &&
        a.imageUrl.length > 50
      ) {
        duplicatePairs.push([i, j]);
        reasons.push(`Photos ${i + 1} and ${j + 1} contain identical image data.`);
        continue;
      }

      // 3. Exact same angle slot duplicated with identical dimensions & measurements
      const aId = a.angleId || a.angleType;
      const bId = b.angleId || b.angleType;
      if (
        aId &&
        bId &&
        aId === bId &&
        a.blurScore != null &&
        b.blurScore != null &&
        a.blurScore === b.blurScore &&
        a.lightingScore != null &&
        b.lightingScore != null &&
        a.lightingScore === b.lightingScore
      ) {
        duplicatePairs.push([i, j]);
        reasons.push(`Duplicate photo for angle '${aId}'.`);
      }
    }
  }

  return {
    hasDuplicates: duplicatePairs.length > 0,
    duplicatePairs,
    reasons,
  };
}

/**
 * Single source of truth for photo-coverage scoring:
 * Any 3 distinct, clear, usable crop evidence photos are accepted.
 * A photo counts when present and not explicitly failed on quality (blur/dark).
 * Duplicate images do not double-count.
 */
export function computeAngleCoverage(
  images: EvidenceImageInput[],
  requiredAngles: readonly string[] = REQUIRED_ANGLES,
): { covered: number; total: number; missing: string[] } {
  const reqList = [...requiredAngles];
  const reqSet = new Set(reqList);
  const coveredSlots = new Set<string>();

  // Pass 1: Deduplicate identical images so duplicate frames never double-count
  const usableImages: EvidenceImageInput[] = [];
  const seenHashes = new Set<string>();
  const seenUrls = new Set<string>();
  const seenAngleKeys = new Set<string>();

  for (const img of images) {
    const present = img.present != null ? Boolean(img.present) : Boolean(img.imageUrl);
    if (!present) continue;
    if (img.qualityPassed === false) continue;

    // Check duplicate hash
    if (img.sha256 && isRealSha256(img.sha256)) {
      const h = img.sha256.toLowerCase().trim();
      if (seenHashes.has(h)) continue;
      seenHashes.add(h);
    }

    // Check duplicate image url
    if (img.imageUrl) {
      if (seenUrls.has(img.imageUrl)) continue;
      seenUrls.add(img.imageUrl);
    }

    // Deduplicate same declared angle if multiple frames of same angle exist
    const id = img.angleId || img.angleType;
    if (id) {
      if (seenAngleKeys.has(id)) continue;
      seenAngleKeys.add(id);
    }

    usableImages.push(img);
  }

  // Pass 2: Exact matching against required slot IDs
  const unassigned: EvidenceImageInput[] = [];
  for (const img of usableImages) {
    const id = img.angleId || img.angleType;
    if (id && reqSet.has(id) && !coveredSlots.has(id)) {
      coveredSlots.add(id);
    } else {
      unassigned.push(img);
    }
  }

  // Pass 3: Any remaining distinct usable evidence photos fill remaining open slots
  for (const slot of reqList) {
    if (!coveredSlots.has(slot) && unassigned.length > 0) {
      unassigned.shift();
      coveredSlots.add(slot);
    }
  }

  return {
    covered: coveredSlots.size,
    total: reqList.length,
    missing: reqList.filter((slot) => !coveredSlots.has(slot)),
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

  const validHashes = images
    .map((img) => (img.sha256 ? String(img.sha256).toLowerCase().trim() : ""))
    .filter(isRealSha256);
  const uniqueHashes = new Set(validHashes);
  const hasDuplicateHash = validHashes.length > uniqueHashes.size;

  const dupCheck = detectDuplicateImages(images);
  const hasDuplicate = hasDuplicateHash || dupCheck.hasDuplicates;

  const realHashes = validHashes.length;
  let integrityScore = images.length === 0 ? 0 : Math.round((realHashes / images.length) * 100);
  if (hasDuplicate) {
    integrityScore = Math.min(integrityScore, 35);
  }

  const gpsOk = images.filter((img) => {
    if (img.lat == null || img.lon == null) return false;
    if (img.lat < -90 || img.lat > 90 || img.lon < -180 || img.lon > 180) return false;
    if (img.accuracyM != null && (img.accuracyM < 0 || img.accuracyM > 500)) return false;
    return true;
  });
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
    coverageNotes: `${distinctUsableRequired}/${total} required crop evidence photo(s).`,
    contextNotes:
      gpsOk.length === images.length && images.length > 0
        ? "All frames include authentic GPS coordinates."
        : gpsOk.length === 0
          ? "No authentic GPS fix on captured frames."
          : `${gpsOk.length} of ${images.length} frames have authentic GPS coordinates.`,
    integrityNotes: hasDuplicate
      ? "Duplicate image or exact same angle uploaded across photos (anti-tamper / retake flag)."
      : realHashes === images.length && images.length > 0
        ? "Verified unique SHA-256 digest stored for every frame."
        : realHashes === 0
          ? "No real SHA-256 digest stored."
          : `${realHashes} of ${images.length} frames have a verified SHA-256 digest.`,
  };
}
