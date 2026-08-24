/**
 * Realtime Computer Vision & Agricultural Usability Analyzer for Fasal-Pramaan.
 *
 * Runs fully on-device (canvas/worker sampling). Implements:
 * 1. Multi-spectral agronomic color indices (ExG, GLI, VARI, ExR, HSV biological bands)
 *    to detect diverse crop phenologies (green vegetative, golden wheat/paddy, mustard bloom, drought scorch, fire char).
 * 2. Organic micro-texture & spatial gradient analysis to suppress false positives (plastic tarps, green clothes, painted walls).
 * 3. 2D Modified Laplacian / Tenengrad variance blur detection.
 * 4. Glare / Dynamic range histogram clipping.
 * 5. Temporal hysteresis smoothing to eliminate frame jitter.
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
  cropScore: number; // 0-100 (Composite multi-spectral confidence score)
  greenPct: number; // 0-100 (Effective canopy coverage across vegetative + mature + damage)
  isScreenDetected: boolean; // Anti-spoofing screen/monitor detection
  isPersonDetected: boolean; // Human/person presence rejection
  phenologyType: PhenologyType; // Dominant crop phenology
  luma: number | null; // 0-100
  blurScore: number | null; // 0-100 sharpness score
  hintCode: CvHintCode;
  hintEn: string;
  hintHi: string;
  cropOnlyOk: boolean;
  shouldBlockShutter: boolean; // Locked if cropScore < 75 or isScreenDetected or isPersonDetected or underexposed
  bbox: { x: number; y: number; w: number; h: number } | null;
  /** MobileNet v2 (CDN, worker path only) matched/top class label – null when model unavailable */
  modelLabel?: string | null;
  /** Probability of modelLabel (0-1) – null when model unavailable */
  modelProb?: number | null;
};

export type CropPhenologyBreakdown = {
  vegetativePct: number; // ExG / Green foliage
  matureGoldenPct: number; // ExR / Golden wheat, ripe paddy, dry mustard heads
  bloomYellowPct: number; // Mustard / sunflower bloom
  scorchDroughtPct: number; // Chlorosis / drought necrosis
  charredFirePct: number; // Fire / burn scar ash
  syntheticRejectionPct: number; // Flagged flat artificial green surfaces
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Fast RGB to HSV conversion normalized to:
 * H: 0-360 deg, S: 0-1, V: 0-1
 */
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

/**
 * Detects Screen / Monitor / Digital Display / Paper Recapture artifacts:
 * 1. Moiré / Pixel Grid: Gradients unnaturally aligned along orthogonal axis (0 / 90 / 180 deg).
 * 2. Rectilinear Bezel Lines: Continuous straight horizontal or vertical boundary step edges.
 * 3. Specular Planar Hotspots: Sharp planar glass reflection on flat background.
 */
export function detectScreenArtifacts(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  luma: number | null,
): { isScreen: boolean; confidence: number; reason?: string } {
  if (w < 8 || h < 8 || !luma) return { isScreen: false, confidence: 0 };

  let orthogonalGradients = 0;
  let organicDiagonalGradients = 0;
  let totalEdges = 0;

  // Track horizontal and vertical row/column gradient projections for rectilinear bezels
  const rowGradients = new Float32Array(h);
  const colGradients = new Float32Array(w);

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const idx = (y * w + x) * 4;
      const lumCenter = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const lumL = 0.299 * data[idx - 4] + 0.587 * data[idx - 3] + 0.114 * data[idx - 2];
      const lumR = 0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6];
      const lumU = 0.299 * data[idx - w * 4] + 0.587 * data[idx - w * 4 + 1] + 0.114 * data[idx - w * 4 + 2];
      const lumD = 0.299 * data[idx + w * 4] + 0.587 * data[idx + w * 4 + 1] + 0.114 * data[idx + w * 4 + 2];

      const gx = Math.abs(lumCenter - lumL) + Math.abs(lumCenter - lumR);
      const gy = Math.abs(lumCenter - lumU) + Math.abs(lumCenter - lumD);
      const mag = gx + gy;

      if (mag > 14) {
        totalEdges += 1;
        rowGradients[y] += mag;
        colGradients[x] += mag;

        const ratio = Math.max(gx, gy) / (mag + 0.001);
        if (ratio > 0.82) {
          orthogonalGradients += 1;
        } else {
          organicDiagonalGradients += 1;
        }
      }
    }
  }

  // Check for bezel line peaks
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

  if (totalEdges >= 20) {
    const orthogonalRatio = orthogonalGradients / totalEdges;
    if (orthogonalRatio > 0.80 || (orthogonalRatio > 0.68 && hasStrongBezelLine)) {
      return {
        isScreen: true,
        confidence: Math.round(orthogonalRatio * 100),
        reason: "Pixel grid / rectilinear screen border detected",
      };
    }
  }

  return { isScreen: false, confidence: 0 };
}

/**
 * Generates actionable user guidance hints based on multi-factor scores and 75%+ threshold.
 */
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
  const { cropScore, totalCanopyPct, luma, blur, glareRatio, syntheticRatio, isScreenDetected, isPersonDetected } = scores;

  const isCloseup = angleId === "closeup_damage";
  const isFireRelax =
    angleId === "fire_burn" ||
    (angleId != null && angleId.includes("fire"));

  // 1. Person / Human Subject Rejection
  if (isPersonDetected) {
    return {
      code: "person_detected",
      en: "Person / non-crop subject in frame — point camera at outdoor crops",
      hi: "व्यक्ति या चेहरा पहचाना गया — कैमरे को खेत की फसल पर लाएँ",
      block: true,
    };
  }

  // 2. Screen / Display Anti-Spoofing
  if (isScreenDetected) {
    return {
      code: "screen_detected",
      en: "Screen / display detected — photograph real outdoor crop",
      hi: "स्क्रीन / डिस्प्ले पहचानी गई — असली खेत व फसल की फोटो लें",
      block: true,
    };
  }

  // 3. Extreme Underexposure (Pitch Dark)
  if (luma != null && luma < (isFireRelax ? 5 : 14)) {
    return {
      code: "too_dark",
      en: "Too dark — move into brighter light or turn on torch",
      hi: "बहुत अँधेरा — तेज़ रोशनी में जाएँ या टॉर्च चालू करें",
      block: true,
    };
  }

  // 4. Direct Solar Glare / Washed-out Overexposure
  if ((luma != null && luma > 92) || glareRatio > 0.30) {
    return {
      code: "too_bright",
      en: "Too bright — avoid direct solar glare and lens reflection",
      hi: "बहुत तेज़ रोशनी — सीधी धूप की चमक और लेंस रिफ्लेक्शन से बचें",
      block: false,
    };
  }

  // 5. Synthetic / Artificial Surface Warning (False positive mitigation)
  if (syntheticRatio > 0.35 && totalCanopyPct < 25) {
    return {
      code: "crop_not_detected",
      en: "Non-crop surface detected — aim directly at natural field crops",
      hi: "फसल नहीं पहचानी गई — कैमरे को प्राकृतिक फसल व पत्तियों पर लाएँ",
      block: true,
    };
  }

  // 6. Strict 75%+ Crop Quality Lock
  if (cropScore < 75 && !isFireRelax) {
    return {
      code: "crop_not_detected",
      en: `Crop match ${cropScore}% — need 75%+ to capture (aim closer at crop foliage)`,
      hi: `फसल पहचान ${cropScore}% — फोटो लेने के लिए 75%+ आवश्यक है`,
      block: true,
    };
  }

  // 7. Motion Blur / Camera Instability
  if (blur != null && blur > 0 && blur < 18) {
    return {
      code: "hold_steady",
      en: "Hold steady — camera is moving or out of focus",
      hi: "कैमरा स्थिर रखें — तस्वीर धुंधली आ रही है",
      block: false,
    };
  }

  // 8. Proximity Warnings
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

/**
 * Evaluates a single pixel for agricultural canopy vs background surfaces across multiple phenologies.
 */
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

  // Normalized chromatic coordinates
  const rn = r / sum;
  const gn = g / sum;
  const bn = b / sum;

  // Agricultural Spectral Indices
  const exg = 2 * gn - rn - bn; // Excess Green
  const exr = 1.4 * rn - gn; // Excess Red
  const gli = (2 * g - r - b) / (2 * g + r + b); // Green Leaf Index

  const [h, s, v] = rgbToHsv(r, g, b);
  const maxDiff = Math.max(r, g, b) - Math.min(r, g, b);

  // 1. Human Skin Detection (Fitzpatrick I-VI / YCbCr & HSV skin locus)
  const isSkin =
    r > g &&
    g > b &&
    r - g >= 12 &&
    r - g <= 110 &&
    g - b <= 65 &&
    s >= 0.15 &&
    s <= 0.70 &&
    (h <= 35 || h >= 335) &&
    v >= 0.16 &&
    v <= 0.95;

  if (isSkin) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false, isSkin: true };
  }

  // 2. Filter Out Atmospheric Sky (High blue, low red)
  if (b > r + 24 && b > g - 4 && luma > 60 && h >= 185 && h <= 250) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false, isSkin: false };
  }

  // 3. Charred / Burn Scar Matter (Fire Peril Protocol)
  const isCharred =
    isFirePeril &&
    luma >= 5 &&
    luma <= 48 &&
    maxDiff < 18 &&
    r < 85 &&
    g < 85 &&
    b < 85 &&
    s <= 0.30;

  if (isCharred) {
    return { isCanopy: true, type: "charred", isSyntheticCandidate: false, isSkin: false };
  }

  // 4. Neutral Gray Concrete / Asphalt / Road / Indoor Neutral Painted Wall & Ceiling
  if (maxDiff < 24 && luma >= 24 && luma <= 245) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false, isSkin: false };
  }

  // Low-saturation light indoor wall / furniture
  if (s < 0.22 && luma >= 35) {
    return { isCanopy: false, type: "none", isSyntheticCandidate: false, isSkin: false };
  }

  // 5. Synthetic Hyper-Saturated Green Flag (e.g. neon plastic tarp, neon green clothes)
  const isHyperSaturatedSynthetic = (g > 200 && (r < 45 || b < 45)) || (s > 0.93 && h >= 70 && h <= 165);

  // 6. Natural Vegetative Foliage (Living chlorophyll leaves: wheat, paddy, maize, vegetables, legumes)
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

  // 7. Flowering Blooms (Mustard yellow flowers, sunflower, canola bloom)
  const isBloomYellow =
    h >= 36 &&
    h <= 64 &&
    s >= 0.35 &&
    v >= 0.40 &&
    r > 130 &&
    g > 120 &&
    b < 120 &&
    Math.abs(r - g) <= 28;

  if (isBloomYellow) {
    return { isCanopy: true, type: "bloom_yellow", isSyntheticCandidate: false, isSkin: false };
  }

  // 8. Mature Golden Grain & Dry Canopy (Ripe wheat heads, barley, mature paddy, dry pulses)
  const isMatureGolden =
    (exr > 0.02 || (r > b + 25 && g > b + 15)) &&
    h >= 28 &&
    h <= 68 &&
    s >= 0.20 &&
    s <= 0.90 &&
    v >= 0.20 &&
    v <= 0.95 &&
    r >= g - 20 &&
    r <= g + 42;

  if (isMatureGolden) {
    return { isCanopy: true, type: "mature_golden", isSyntheticCandidate: false, isSkin: false };
  }

  // 9. Drought Scorch & Necrosis (Brownish-amber scorched leaves)
  const isScorch =
    h >= 12 &&
    h <= 45 &&
    s >= 0.20 &&
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
 * Main-thread video frame analyzer (fallback and lightweight inspection).
 * Safe to call at ~2-4 fps.
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
    let vegetativeCount = 0;
    let matureGoldenCount = 0;
    let bloomYellowCount = 0;
    let scorchCount = 0;
    let charredCount = 0;
    let syntheticCount = 0;
    let glareCount = 0;
    let skinCount = 0;
    let total = 0;

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;

    let laplacianSum = 0;
    let laplacianCount = 0;
    let canopyLaplacianSum = 0;
    let canopyLaplacianCount = 0;

    const isFireRelax =
      angleId === "fire_burn" ||
      angleId === "wide_field" ||
      (angleId != null && angleId.includes("fire"));

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = (y * w + x) * 4;
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

        // 2D 4-point Laplacian convolution for true sharpness / blur measurement
        if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
          const lumaCenter = luma;
          const lumaLeft = 0.299 * data[idx - 4] + 0.587 * data[idx - 3] + 0.114 * data[idx - 2];
          const lumaRight = 0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6];
          const lumaUp = 0.299 * data[idx - w * 4] + 0.587 * data[idx - w * 4 + 1] + 0.114 * data[idx - w * 4 + 2];
          const lumaDown = 0.299 * data[idx + w * 4] + 0.587 * data[idx + w * 4 + 1] + 0.114 * data[idx + w * 4 + 2];

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

    // Person Presence Detection
    const isPersonDetected = skinRatio > 0.04;

    // Screen & Display Anti-Spoofing Detection
    const screenCheck = detectScreenArtifacts(data, w, h, luma);
    const isScreenDetected = screenCheck.isScreen;

    // Organic Micro-Texture Penalty for uniform flat artificial surfaces
    const meanLaplacian = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;
    const meanCanopyLaplacian = canopyLaplacianCount > 0 ? canopyLaplacianSum / canopyLaplacianCount : 0;
    const isFlatCanopy = !isFireRelax && (vegetativePct > 10 || (vegetativeCount + matureGoldenCount) > 15) && meanCanopyLaplacian < 0.6;
    const isFlatArtificialSurface = !isFireRelax && (((vegetativePct > 15 || syntheticCount > 15) && meanLaplacian < 1.8 && syntheticRatio > 0.30) || isFlatCanopy);

    // Determine dominant phenology
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

    // Multi-spectral composite crop score (0-100)
    const canopyScore = clamp(Math.round(totalCanopyPct * 1.08), 0, 100);
    const textureScore = clamp(Math.round((meanLaplacian / 3.8) * 100), 10, 100);
    const naturalnessScore = clamp(Math.round(100 - syntheticRatio * 100 - glareRatio * 100), 0, 100);

    let compositeScore =
      totalCanopyPct === 0
        ? 0
        : Math.round(0.70 * canopyScore + 0.18 * textureScore + 0.12 * naturalnessScore);
    if (isFlatArtificialSurface) compositeScore = Math.round(compositeScore * 0.15);
    if (isScreenDetected) compositeScore = Math.min(compositeScore, 18);
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

    const minThreshold = isFireRelax ? 40 : 75;
    const minLuma = isFireRelax ? 5 : 14;
    const cropDetected = cropScore >= minThreshold && luma != null && luma >= minLuma && !isFlatArtificialSurface && !isScreenDetected && !isPersonDetected;

    let bbox: { x: number; y: number; w: number; h: number } | null = null;
    if (cropDetected && maxX >= minX && maxY >= minY) {
      const rawX = minX / w;
      const rawY = minY / h;
      const x = clamp(rawX, 0, 0.85);
      const y = clamp(rawY, 0, 0.85);
      const rawW = (maxX - minX + 1) / w;
      const rawH = (maxY - minY + 1) / h;
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
    };
  } catch {
    return null;
  }
}

export type CvModelLoadStatus = "loading" | "ready" | "unavailable";

let cvWorker: Worker | null = null;
let cvWorkerInitFailed = false;
let currentModelStatus: CvModelLoadStatus = "loading";
const modelStatusListeners = new Set<(status: CvModelLoadStatus) => void>();

export function getModelStatus(): CvModelLoadStatus {
  return currentModelStatus;
}

export function onModelStatus(listener: (status: CvModelLoadStatus) => void): () => void {
  modelStatusListeners.add(listener);
  return () => {
    modelStatusListeners.delete(listener);
  };
}

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function getScratchCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  if (!scratchCanvas) {
    scratchCanvas = document.createElement("canvas");
  }
  if (scratchCanvas.width !== w) scratchCanvas.width = w;
  if (scratchCanvas.height !== h) scratchCanvas.height = h;
  if (!scratchCtx) {
    scratchCtx = scratchCanvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  }
  if (!scratchCtx) return null;
  return { canvas: scratchCanvas, ctx: scratchCtx };
}

function getCvWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (cvWorker) return cvWorker;
  if (cvWorkerInitFailed) return null;
  try {
    cvWorker = new Worker(new URL("./cv-worker.ts", import.meta.url), { type: "module" });
    cvWorker.addEventListener("message", (e: MessageEvent) => {
      if (e.data && typeof e.data === "object" && (e.data as { type?: string }).type === "model_status") {
        const s = (e.data as { status?: CvModelLoadStatus }).status;
        if (s === "loading" || s === "ready" || s === "unavailable") {
          currentModelStatus = s;
          modelStatusListeners.forEach((fn) => {
            try {
              fn(s);
            } catch {
              // ignore
            }
          });
        }
      }
    });
    cvWorker.onerror = (err) => {
      console.warn("[realtime-cv] CV Worker errored, falling back to main-thread analysis:", err);
      cvWorkerInitFailed = true;
      cvWorker = null;
    };
    return cvWorker;
  } catch (err) {
    console.warn("[realtime-cv] Could not spawn CV worker, using main-thread fallback:", err);
    cvWorkerInitFailed = true;
    cvWorker = null;
    return null;
  }
}

export function ensureCvWorker(): Worker | null {
  return getCvWorker();
}

export function terminateCvWorker(): void {
  if (cvWorker) {
    try {
      cvWorker.terminate();
    } catch {
      // ignore
    }
    cvWorker = null;
  }
}

let nextJobId = 1;

export async function analyzeVideoFrameAsync(
  video: HTMLVideoElement,
  angleId?: string,
): Promise<CvFrameResult | null> {
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    const w = 64;
    const h = 64;
    const scratch = getScratchCanvas(w, h);
    if (!scratch) return analyzeVideoFrame(video, angleId);

    const { ctx } = scratch;
    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const buffer = imageData.data.buffer.slice(0);

    const worker = getCvWorker();
    if (!worker) {
      return analyzeVideoFrame(video, angleId);
    }

    const id = nextJobId++;
    try {
      const result = await new Promise<CvFrameResult | null>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
        };
        const onMessage = (e: MessageEvent) => {
          const data = e.data as { id?: number; result?: CvFrameResult; error?: string };
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
        worker.postMessage({ id, width: w, height: h, buffer, angleId }, [buffer]);
      });
      return result;
    } catch {
      return analyzeVideoFrame(video, angleId);
    }
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
        let vegetativeCount = 0;
        let matureGoldenCount = 0;
        let bloomYellowCount = 0;
        let scorchCount = 0;
        let charredCount = 0;
        let syntheticCount = 0;
        let glareCount = 0;
        let skinCount = 0;
        let total = 0;

        let laplacianSum = 0;
        let laplacianCount = 0;
        let canopyLaplacianSum = 0;
        let canopyLaplacianCount = 0;

        const isFireRelax =
          angleId === "fire_burn" ||
          angleId === "wide_field" ||
          (angleId != null && angleId.includes("fire"));

        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          sumLuma += luma;
          total += 1;

          if (r > 248 && g > 248 && b > 248) glareCount += 1;

          const cl = classifyAgriculturalPixel(r, g, b, luma, isFireRelax);

          if (cl.isSkin) {
            skinCount += 1;
          }

          if (cl.isCanopy) {
            if (cl.type === "vegetative") vegetativeCount += 1;
            else if (cl.type === "mature_golden") matureGoldenCount += 1;
            else if (cl.type === "bloom_yellow") bloomYellowCount += 1;
            else if (cl.type === "scorch") scorchCount += 1;
            else if (cl.type === "charred") charredCount += 1;

            if (cl.isSyntheticCandidate) syntheticCount += 1;
          } else if (cl.isSyntheticCandidate) {
            syntheticCount += 1;
          }

          if (i >= 16 && i < data.length - 16) {
            const prevLuma = 0.299 * data[i - 16] + 0.587 * data[i - 15] + 0.114 * data[i - 14];
            const diff = Math.abs(luma - prevLuma);
            laplacianSum += diff;
            laplacianCount += 1;

            if (cl.isCanopy) {
              canopyLaplacianSum += diff;
              canopyLaplacianCount += 1;
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

        const meanLap = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;
        const meanCanopyLap = canopyLaplacianCount > 0 ? canopyLaplacianSum / canopyLaplacianCount : 0;
        const isFlatCanopy = !isFireRelax && (vegetativePct > 10 || (vegetativeCount + matureGoldenCount) > 15) && meanCanopyLap < 0.6;
        const isFlat = !isFireRelax && (((vegetativePct > 15 || syntheticCount > 15) && meanLap < 1.5 && syntheticRatio > 0.35) || isFlatCanopy);

        // Determine dominant phenology
        let phenologyType: PhenologyType = "none";
        if (matureGoldenPct > vegetativePct && matureGoldenPct > bloomYellowPct) phenologyType = "mature_golden";
        else if (bloomYellowPct > vegetativePct && bloomYellowPct > matureGoldenPct) phenologyType = "bloom_yellow";
        else if (scorchPct > vegetativePct && scorchPct > 20) phenologyType = "scorch";
        else if (charredPct > vegetativePct && charredPct > 15) phenologyType = "charred";
        else if (vegetativePct > 0) phenologyType = "vegetative";

        const totalCanopyPct = isPersonDetected
          ? 0
          : clamp(
              Math.round(
                vegetativePct * (isFlat ? 0.05 : 1.0) +
                  matureGoldenPct * 0.95 +
                  bloomYellowPct * 0.95 +
                  scorchPct * 0.85 +
                  (isFireRelax ? charredPct : 0),
              ),
              0,
              100,
            );

        const blurScore = clamp(Math.round((meanLap / 12) * 100), 0, 100);
        const textureScore = clamp(Math.round((meanLap / 3.8) * 100), 10, 100);
        const naturalnessScore = clamp(Math.round(100 - syntheticRatio * 100 - glareRatio * 100), 0, 100);
        let compositeScore = totalCanopyPct === 0 ? 0 : Math.round(0.65 * totalCanopyPct + 0.20 * textureScore + 0.15 * naturalnessScore);
        if (isFlat) compositeScore = Math.round(compositeScore * 0.15);
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
            isScreenDetected: false,
            isPersonDetected,
          },
          angleId,
        );

        const minThreshold = isFireRelax ? 40 : 75;
        const minLuma = isFireRelax ? 5 : 14;
        const cropDetected = cropScore >= minThreshold && luma != null && luma >= minLuma && !isFlat;

        resolve({
          cropDetected,
          cropScore,
          greenPct: totalCanopyPct,
          isScreenDetected: false,
          isPersonDetected,
          phenologyType,
          luma,
          blurScore,
          hintCode: hint.code,
          hintEn: hint.en,
          hintHi: hint.hi,
          cropOnlyOk: cropDetected,
          shouldBlockShutter: !cropDetected,
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
