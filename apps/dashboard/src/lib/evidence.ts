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
  luma?: number | null;
  greenPct?: number | null;
  cropScore?: number | null;
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
  sha256?: string | null;
  pHash?: string | null;
  bytes?: Uint8Array;
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

/**
 * Computes a 64-bit difference hash (dHash) from raw image pixel data (RGBA).
 * Downsamples the image into a 9x8 luminance grid, compares adjacent pixels horizontally,
 * and encodes the resulting 64 comparison bits into a 16-character hexadecimal string.
 */
export function computeDHashFromImageData(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): string {
  if (width < 9 || height < 8 || data.length < width * height * 4) {
    return "";
  }
  const lumaGrid: number[][] = [];
  for (let y = 0; y < 8; y++) {
    const row: number[] = [];
    const srcY = Math.floor((y * height) / 8);
    for (let x = 0; x < 9; x++) {
      const srcX = Math.floor((x * width) / 9);
      const idx = (srcY * width + srcX) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      row.push(lum);
    }
    lumaGrid.push(row);
  }

  let hex = "";
  for (let y = 0; y < 8; y++) {
    let byteVal = 0;
    for (let x = 0; x < 8; x++) {
      if (lumaGrid[y][x] > lumaGrid[y][x + 1]) {
        byteVal |= 1 << (7 - x);
      }
    }
    hex += byteVal.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Calculates the Hamming distance (number of bit differences) between two 64-bit hex hashes.
 * A distance <= 6 (out of 64 bits, >90% similarity) indicates exact duplicate or near-identical viewpoint.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    const v1 = parseInt(hash1[i], 16);
    const v2 = parseInt(hash2[i], 16);
    if (isNaN(v1) || isNaN(v2)) return 64;
    let xor = v1 ^ v2;
    while (xor > 0) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

export function isUnusableLighting(lightingScore?: number | null): boolean {
  if (lightingScore == null) return false;
  return lightingScore < 15 || lightingScore > 98;
}

export function qualityPassedFromSignals(signals: {
  lightingScore?: number;
  blurScore?: number;
}): boolean {
  if (isUnusableLighting(signals.lightingScore)) return false;
  if (typeof signals.blurScore === "number" && signals.blurScore < 18) return false;
  return true;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    let acc = 0;
    for (let i = 0; i < bytes.length; i++) acc = (acc * 31 + bytes[i]) >>> 0;
    return acc.toString(16).padStart(64, "0");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes as any);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256FromDataUrl(dataUrl: string): Promise<string> {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return sha256Hex(new Uint8Array(0));
  const b64 = dataUrl.slice(comma + 1);
  if (typeof Buffer !== "undefined") {
    return sha256Hex(new Uint8Array(Buffer.from(b64, "base64")));
  }
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return sha256Hex(u8);
}

export function measureLightingScore(imageData: ImageData): number {
  const data = imageData.data;
  const totalPixels = data.length / 4;
  if (totalPixels === 0) return 0;
  let lumaSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    lumaSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const meanLuma = lumaSum / totalPixels;
  return Math.round((meanLuma / 255) * 100);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Detect duplicate or exact-same-angle images across evidence inputs.
 * Checks for duplicate SHA-256 digests, identical data URLs, perceptual dHash similarity,
 * or identical continuous edge signals.
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

      // 2. Identical non-empty data URL or trimmed image URL
      if (
        a.imageUrl &&
        b.imageUrl &&
        a.imageUrl.trim() === b.imageUrl.trim() &&
        a.imageUrl.trim().length > 50
      ) {
        duplicatePairs.push([i, j]);
        reasons.push(`Photos ${i + 1} and ${j + 1} contain identical image data.`);
        continue;
      }

      // 3. Identical image byte contents if available
      if (
        a.bytes &&
        b.bytes &&
        a.bytes.length > 0 &&
        a.bytes.length === b.bytes.length
      ) {
        let same = true;
        for (let k = 0; k < a.bytes.length; k++) {
          if (a.bytes[k] !== b.bytes[k]) {
            same = false;
            break;
          }
        }
        if (same) {
          duplicatePairs.push([i, j]);
          reasons.push(`Photos ${i + 1} and ${j + 1} contain identical byte contents.`);
          continue;
        }
      }

      // 4. Perceptual dHash comparison (distance <= 6 of 64 bits = duplicate angle / same scene)
      if (
        a.pHash &&
        b.pHash &&
        a.pHash.length === 16 &&
        b.pHash.length === 16
      ) {
        const dist = hammingDistance(a.pHash, b.pHash);
        if (dist <= 6) {
          duplicatePairs.push([i, j]);
          reasons.push(`Photos ${i + 1} and ${j + 1} share near-identical perceptual hash (distance ${dist}/64, exact same angle / duplicate shot).`);
          continue;
        }
      }

      // 5. Multi-metric continuous CV measurement match across frames (even across different slot labels)
      const scoresMatch =
        a.blurScore != null &&
        b.blurScore != null &&
        a.blurScore === b.blurScore &&
        a.lightingScore != null &&
        b.lightingScore != null &&
        a.lightingScore === b.lightingScore;

      const lumaMatch =
        a.luma != null &&
        b.luma != null &&
        a.luma === b.luma;

      const cropMatch =
        a.cropScore != null &&
        b.cropScore != null &&
        a.cropScore === b.cropScore;

      const greenMatch =
        a.greenPct != null &&
        b.greenPct != null &&
        a.greenPct === b.greenPct;

      if (scoresMatch && (lumaMatch || cropMatch || greenMatch || a.angleId === b.angleId || a.angleType === b.angleType)) {
        duplicatePairs.push([i, j]);
        reasons.push(`Photos ${i + 1} and ${j + 1} share identical sensor and CV feature signatures.`);
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
  const seenReqSlots = new Set<string>();

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
      const u = img.imageUrl.trim();
      if (seenUrls.has(u)) continue;
      seenUrls.add(u);
    }

    // Only deduplicate identical slot IDs if both target the exact same required slot (e.g. two photo_1 frames)
    const id = img.angleId || img.angleType;
    if (id && reqSet.has(id)) {
      if (seenReqSlots.has(id)) continue;
      seenReqSlots.add(id);
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
