/**
 * Shared on-device agronomic CV (no TF.js). Used by the module worker and
 * the main-thread fallback so live preview and captured stills cannot drift.
 */

export type CvHintCode =
  | "ok"
  | "crop_not_detected"
  | "too_dark"
  | "too_bright"
  | "too_close"
  | "too_far"
  | "hold_steady"
  | "center_crop"
  | "screen_detected"
  | "person_detected";

export type PhenologyType =
  | "vegetative"
  | "mature_golden"
  | "bloom_yellow"
  | "scorch"
  | "charred"
  | "mixed"
  | "none";

export type CvFrameResult = {
  cropDetected: boolean;
  cropScore: number;
  greenPct: number;
  isScreenDetected: boolean;
  isPersonDetected: boolean;
  phenologyType: PhenologyType;
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

export type ModelVerdict = { label: string | null; prob: number | null; saysPlant: boolean };

/** Preview + still + gate: luma 0-100. Fire perils use FIRE_DARK_LUMA_MIN. */
export const DARK_LUMA_MIN = 14;
export const FIRE_DARK_LUMA_MIN = 5;
export const CROP_LOCK_SCORE = 75;
export const BLUR_HOLD_STEADY = 18;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function isFireRelaxAngle(angleId?: string): boolean {
  return (
    angleId === "fire_burn" ||
    angleId === "wide_field" ||
    angleId === "photo_1" ||
    (angleId != null && angleId.includes("fire"))
  );
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
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

function pixelLuma(data: Uint8ClampedArray, idx: number): number {
  return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
}

export function detectScreenArtifacts(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  luma: number | null,
): { isScreen: boolean; confidence: number; reason?: string } {
  if (w < 8 || h < 8 || !luma) return { isScreen: false, confidence: 0 };

  let orthogonalGradients = 0;
  let totalEdges = 0;
  let evenRowSum = 0;
  let oddRowSum = 0;
  let evenRowN = 0;
  let oddRowN = 0;
  let rgbFlip = 0;
  let rgbPairs = 0;

  const rowGradients = new Float32Array(h);
  const colGradients = new Float32Array(w);
  const rowMean = new Float32Array(h);

  for (let y = 0; y < h; y += 1) {
    let rowLuma = 0;
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * 4;
      const lumCenter = pixelLuma(data, idx);
      rowLuma += lumCenter;
      if (y % 2 === 0) {
        evenRowSum += lumCenter;
        evenRowN += 1;
      } else {
        oddRowSum += lumCenter;
        oddRowN += 1;
      }
      if (x + 1 < w) {
        const nx = idx + 4;
        const dR = Math.abs(data[idx] - data[nx]);
        const dG = Math.abs(data[idx + 1] - data[nx + 1]);
        const dB = Math.abs(data[idx + 2] - data[nx + 2]);
        rgbPairs += 1;
        if (dR + dG + dB > 90 && Math.max(dR, dG, dB) > 40) rgbFlip += 1;
      }
      if (y === 0 || x === 0 || y === h - 1 || x === w - 1) continue;
      const lumL = pixelLuma(data, idx - 4);
      const lumR = pixelLuma(data, idx + 4);
      const lumU = pixelLuma(data, idx - w * 4);
      const lumD = pixelLuma(data, idx + w * 4);
      const gx = Math.abs(lumCenter - lumL) + Math.abs(lumCenter - lumR);
      const gy = Math.abs(lumCenter - lumU) + Math.abs(lumCenter - lumD);
      const mag = gx + gy;
      if (mag > 14) {
        totalEdges += 1;
        rowGradients[y] += mag;
        colGradients[x] += mag;
        if (Math.max(gx, gy) / (mag + 0.001) > 0.82) orthogonalGradients += 1;
      }
    }
    rowMean[y] = rowLuma / Math.max(1, w);
  }

  const evenMean = evenRowN ? evenRowSum / evenRowN : 0;
  const oddMean = oddRowN ? oddRowSum / oddRowN : 0;
  const scanlineDelta = Math.abs(evenMean - oddMean);
  if (scanlineDelta > 55 && evenRowN > 20 && oddRowN > 20) {
    return {
      isScreen: true,
      confidence: Math.min(99, Math.round(scanlineDelta)),
      reason: "Horizontal scanlines (photo of a display)",
    };
  }

  const rgbFlipRatio = rgbPairs ? rgbFlip / rgbPairs : 0;
  if (rgbFlipRatio > 0.42 && totalEdges > 30) {
    return {
      isScreen: true,
      confidence: Math.round(rgbFlipRatio * 100),
      reason: "Subpixel / moiré grid typical of a second screen",
    };
  }

  let maxRowPeak = 0;
  let maxColPeak = 0;
  for (let y = 1; y < h - 1; y += 1) {
    if (rowGradients[y] > maxRowPeak) maxRowPeak = rowGradients[y];
  }
  for (let x = 1; x < w - 1; x += 1) {
    if (colGradients[x] > maxColPeak) maxColPeak = colGradients[x];
  }
  const avgRowMag = totalEdges > 0 ? (totalEdges * 25) / h : 1;
  const hasStrongBezelLine = maxRowPeak > avgRowMag * 3.5 || maxColPeak > avgRowMag * 3.5;

  const border = Math.max(1, Math.round(Math.min(w, h) * 0.08));
  let borderDark = 0;
  let borderN = 0;
  let innerBright = 0;
  let innerN = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const lum = pixelLuma(data, (y * w + x) * 4);
      const onBorder = x < border || y < border || x >= w - border || y >= h - border;
      if (onBorder) {
        borderN += 1;
        if (lum < 40) borderDark += 1;
      } else {
        innerN += 1;
        if (lum > 70) innerBright += 1;
      }
    }
  }
  const darkBezel = borderN > 0 && borderDark / borderN > 0.55 && innerN > 0 && innerBright / innerN > 0.35;
  if (darkBezel && hasStrongBezelLine) {
    return {
      isScreen: true,
      confidence: 86,
      reason: "Device bezel around a bright rectangular display",
    };
  }

  if (totalEdges >= 20 && (hasStrongBezelLine || darkBezel)) {
    const orthogonalRatio = orthogonalGradients / totalEdges;
    if (orthogonalRatio > 0.68) {
      return {
        isScreen: true,
        confidence: Math.round(orthogonalRatio * 100),
        reason: "Pixel grid / rectilinear screen border detected",
      };
    }
  }

  return { isScreen: false, confidence: 0 };
}

function hintFor(
  scores: {
    cropScore: number;
    totalCanopyPct: number;
    vegetativePct: number;
    luma: number | null;
    blur: number | null;
    glareRatio: number;
    syntheticRatio: number;
    isScreenDetected: boolean;
    isPersonDetected: boolean;
  },
  angleId?: string,
): { code: CvHintCode; en: string; hi: string; block: boolean } {
  const { cropScore, totalCanopyPct, vegetativePct, luma, blur, glareRatio, syntheticRatio, isScreenDetected, isPersonDetected } =
    scores;

  const isCloseup = angleId === "closeup_damage";
  const isFireRelax = isFireRelaxAngle(angleId);

  if (isPersonDetected) {
    return {
      code: "person_detected",
      en: "Person / non-crop subject in frame — point camera at outdoor crops",
      hi: "व्यक्ति या चेहरा पहचाना गया — कैमरे को खेत की फसल पर लाएँ",
      block: true,
    };
  }

  if (isScreenDetected) {
    const isOutdoorCanopy = (totalCanopyPct >= 35 && vegetativePct >= 20) || cropScore >= 60;
    if (!isOutdoorCanopy) {
      return {
        code: "screen_detected",
        en: "Screen / display detected — photograph real outdoor crop",
        hi: "स्क्रीन / डिस्प्ले पहचानी गई — असली खेत व फसल की फोटो लें",
        block: true,
      };
    }
  }

  const darkFloor = isFireRelax ? FIRE_DARK_LUMA_MIN : DARK_LUMA_MIN;
  if (luma != null && luma < darkFloor) {
    return {
      code: "too_dark",
      en: "Too dark — move into brighter light or turn on torch",
      hi: "बहुत अँधेरा — तेज़ रोशनी में जाएँ या टॉर्च चालू करें",
      block: true,
    };
  }

  if ((luma != null && luma > 92) || glareRatio > 0.3) {
    return {
      code: "too_bright",
      en: "Too bright — avoid direct solar glare and lens reflection",
      hi: "बहुत तेज़ रोशनी — सीधी धूप की चमक और लेंस रिफ्लेक्शन से बचें",
      block: false,
    };
  }

  if (syntheticRatio > 0.35 && totalCanopyPct < 25) {
    return {
      code: "crop_not_detected",
      en: "Non-crop surface detected — aim directly at natural field crops",
      hi: "फसल नहीं पहचानी गई — कैमरे को प्राकृतिक फसल व पत्तियों पर लाएँ",
      block: true,
    };
  }

  if (cropScore < CROP_LOCK_SCORE && !isFireRelax) {
    return {
      code: "crop_not_detected",
      en: `Crop match ${cropScore}% — need 75%+ to capture (aim closer at crop foliage)`,
      hi: `फसल पहचान ${cropScore}% — फोटो लेने के लिए 75%+ आवश्यक है`,
      block: true,
    };
  }

  if (blur != null && blur > 0 && blur < BLUR_HOLD_STEADY) {
    return {
      code: "hold_steady",
      en: "Hold steady — camera is moving or out of focus",
      hi: "कैमरा स्थिर रखें — तस्वीर धुंधली आ रही है",
      block: false,
    };
  }

  if (totalCanopyPct > 98 && blur != null && blur < 15 && !isCloseup) {
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
    en: "Good crop framing & focus — ready to capture",
    hi: "सही फसल व फ्रेम — कैप्चर के लिए तैयार",
    block: false,
  };
}

export function classifyAgriculturalPixel(
  r: number,
  g: number,
  b: number,
  luma: number,
  isFirePeril: boolean = false,
): {
  isCanopy: boolean;
  type: "vegetative" | "mature_golden" | "bloom_yellow" | "scorch" | "charred" | "none";
  isSyntheticCandidate: boolean;
  isSkin: boolean;
} {
  const sum = r + g + b;
  if (sum === 0) return { isCanopy: false, type: "none", isSyntheticCandidate: false, isSkin: false };

  const rn = r / sum;
  const gn = g / sum;
  const bn = b / sum;

  const exg = 2 * gn - rn - bn;
  const exr = 1.4 * rn - gn;
  const gli = (2 * g - r - b) / (2 * g + r + b);

  const [h, s, v] = rgbToHsv(r, g, b);
  const maxDiff = Math.max(r, g, b) - Math.min(r, g, b);

  const isSkin =
    r > g &&
    g > b &&
    r - g >= 12 &&
    r - g <= 110 &&
    g - b <= 65 &&
    s >= 0.15 &&
    s <= 0.7 &&
    (h <= 35 || h >= 335) &&
    v >= 0.16 &&
    v <= 0.95;

  if (isSkin) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false, isSkin: true };
  }

  if (b > r + 24 && b > g - 4 && luma > 60 && h >= 185 && h <= 250) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false, isSkin: false };
  }

  const isCharred =
    isFirePeril &&
    luma >= 5 &&
    luma <= 48 &&
    maxDiff < 18 &&
    r < 85 &&
    g < 85 &&
    b < 85 &&
    s <= 0.3;

  if (isCharred) {
    return { isCanopy: true, type: "charred", isSyntheticCandidate: false, isSkin: false };
  }

  if (maxDiff < 24 && luma >= 24 && luma <= 245) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false, isSkin: false };
  }

  if (s < 0.22 && luma >= 35) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false, isSkin: false };
  }

  const isHyperSaturatedSynthetic = (g > 200 && (r < 45 || b < 45)) || (s > 0.93 && h >= 70 && h <= 165);

  const isVegetative =
    (exg > 0.08 || (gli > 0.04 && g > r + 10 && g > b + 10)) &&
    g > r + 12 &&
    g > b + 12 &&
    h >= 68 &&
    h <= 162 &&
    s >= 0.22 &&
    v >= 0.14 &&
    v <= 0.94;

  if (isVegetative) {
    return {
      isCanopy: !isHyperSaturatedSynthetic,
      type: isHyperSaturatedSynthetic ? "none" : "vegetative",
      isSyntheticCandidate: isHyperSaturatedSynthetic,
      isSkin: false,
    };
  }

  if (isHyperSaturatedSynthetic) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: true, isSkin: false };
  }

  const isBloomYellow =
    h >= 36 &&
    h <= 64 &&
    s >= 0.35 &&
    v >= 0.4 &&
    r > 130 &&
    g > 120 &&
    b < 120 &&
    Math.abs(r - g) <= 28;

  if (isBloomYellow) {
    return { isCanopy: true, type: "bloom_yellow", isSyntheticCandidate: false, isSkin: false };
  }

  const isMatureGolden =
    (exr > 0.02 || (r > b + 25 && g > b + 15)) &&
    h >= 28 &&
    h <= 68 &&
    s >= 0.2 &&
    s <= 0.9 &&
    v >= 0.2 &&
    v <= 0.95 &&
    r >= g - 20 &&
    r <= g + 42;

  if (isMatureGolden) {
    return { isCanopy: true, type: "mature_golden", isSyntheticCandidate: false, isSkin: false };
  }

  const isScorch =
    h >= 12 &&
    h <= 45 &&
    s >= 0.2 &&
    s <= 0.85 &&
    v >= 0.15 &&
    v <= 0.85 &&
    r > g + 40 &&
    r > b + 25;

  if (isScorch) {
    return { isCanopy: true, type: "scorch", isSyntheticCandidate: false, isSkin: false };
  }

  return { isCanopy: false, type: "none", isSyntheticCandidate: false, isSkin: false };
}

/**
 * Canonical frame analyzer. Live preview, captured stills, and the worker
 * all call this so shutter locks and gate metadata stay aligned.
 */
export function analyzeFrame(
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
  let skinCount = 0;
  let total = 0;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  let laplacianSum = 0;
  let laplacianCount = 0;
  let canopyLaplacianSum = 0;
  let canopyLaplacianCount = 0;

  const isFireRelax = isFireRelaxAngle(angleId);
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

      const classification = classifyAgriculturalPixel(r, g, b, luma, isFireRelax);

      if (classification.isSkin) {
        skinCount += 1;
      }

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

        if (classification.isCanopy) {
          canopyLaplacianSum += lap;
          canopyLaplacianCount += 1;
        }
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
  const skinRatio = total ? skinCount / total : 0;

  const isPersonDetected = skinRatio > 0.04;

  const screenCheck = detectScreenArtifacts(data, width, height, luma);
  const isScreenDetected = screenCheck.isScreen;

  // Laplacian is raw luma-difference units (0-255), vegetativePct is 0-100.
  // Never OR a tiny pixel-count with a percent — that made the flat-canopy
  // penalty fire on legitimate smooth canopies after 64×64 downsampling.
  const meanLaplacian = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;
  const isFlatArtificialSurface =
    !isFireRelax &&
    (vegetativePct > 15 || syntheticCount > 15) &&
    meanLaplacian < 1.8 &&
    syntheticRatio > 0.3;

  let phenologyType: PhenologyType = "none";
  if (matureGoldenPct > vegetativePct && matureGoldenPct > bloomYellowPct) phenologyType = "mature_golden";
  else if (bloomYellowPct > vegetativePct && bloomYellowPct > matureGoldenPct) phenologyType = "bloom_yellow";
  else if (scorchPct > vegetativePct && scorchPct > 20) phenologyType = "scorch";
  else if (charredPct > vegetativePct && charredPct > 15) phenologyType = "charred";
  else if (vegetativePct > 0) phenologyType = "vegetative";

  const rawCanopyPct =
    vegetativePct * (isFlatArtificialSurface ? 0.05 : 1.0) +
    matureGoldenPct * 0.95 +
    bloomYellowPct * 0.95 +
    scorchPct * 0.85 +
    (isFireRelax ? charredPct : 0);

  const totalCanopyPct = isPersonDetected ? 0 : clamp(Math.round(rawCanopyPct), 0, 100);
  const blurScore = clamp(Math.round((meanLaplacian / 12) * 100), 0, 100);

  const canopyScore = clamp(Math.round(totalCanopyPct * 1.08), 0, 100);
  const textureScore = clamp(Math.round((meanLaplacian / 3.8) * 100), 10, 100);
  const naturalnessScore = clamp(Math.round(100 - syntheticRatio * 100 - glareRatio * 100), 0, 100);

  let compositeScore =
    totalCanopyPct === 0
      ? 0
      : Math.round(0.7 * canopyScore + 0.18 * textureScore + 0.12 * naturalnessScore);
  if (isFlatArtificialSurface) compositeScore = Math.round(compositeScore * 0.15);
  if (isScreenDetected) compositeScore = Math.min(compositeScore, 12);
  if (isPersonDetected) compositeScore = 0;
  const cropScore = clamp(compositeScore, 0, 100);

  const hint = hintFor(
    {
      cropScore,
      totalCanopyPct,
      vegetativePct,
      luma,
      blur: blurScore,
      glareRatio,
      syntheticRatio,
      isScreenDetected,
      isPersonDetected,
    },
    angleId,
  );

  const minThreshold = isFireRelax ? 40 : CROP_LOCK_SCORE;
  const minLuma = isFireRelax ? FIRE_DARK_LUMA_MIN : DARK_LUMA_MIN;
  const cropDetected =
    cropScore >= minThreshold &&
    luma != null &&
    luma >= minLuma &&
    !isFlatArtificialSurface &&
    !isScreenDetected &&
    !isPersonDetected;

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

  const shouldBlockShutter = hint.block || !cropDetected;

  return {
    cropDetected,
    cropScore,
    greenPct: totalCanopyPct,
    isScreenDetected,
    isPersonDetected,
    phenologyType: isPersonDetected ? "none" : phenologyType,
    luma,
    blurScore,
    hintCode: hint.code,
    hintEn: hint.en,
    hintHi: hint.hi,
    cropOnlyOk: cropDetected,
    shouldBlockShutter,
    bbox: isPersonDetected ? null : bbox,
    modelLabel: modelVerdict?.label ?? null,
    modelProb: modelVerdict?.prob ?? null,
  };
}
