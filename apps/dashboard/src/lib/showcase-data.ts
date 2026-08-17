import { Submission, EvidenceEvaluation, Overview, MapMarker } from "./api";

// Helper to generate agricultural SVG mock photo data URIs
export function generateMockCropSvg(
  angle: string,
  crop: string,
  damageType: string,
  isBlurry = false,
  isTampered = false,
  confidence = 90
): string {
  const angleTitles: Record<string, string> = {
    wide_field: "Angle 1: Wide Field Perspective",
    left_context: "Angle 2: Left Plot Context",
    mid_canopy: "Angle 3: Mid-Canopy Density",
    right_context: "Angle 4: Right Plot Context",
    closeup_damage: "Angle 5: Close-up Macro Damage",
  };

  const title = angleTitles[angle] || `Angle: ${angle}`;
  const filterDef = isBlurry
    ? `<filter id="blur"><feGaussianBlur stdDeviation="7" /></filter>`
    : "";
  const filterAttr = isBlurry ? 'filter="url(#blur)"' : "";

  const stampColor = isTampered ? "#ef4444" : "#10b981";
  const stampText = isTampered
    ? "⚠️ INTEGRITY FAILED · MOCK GPS / DUPLICATE"
    : `✓ CRYPTO VERIFIED · SHA256 VALID · ${confidence.toFixed(1)}% CONF`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
    <defs>
      ${filterDef}
      <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#bae6fd" />
      </linearGradient>
      <linearGradient id="cropGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#22c55e" />
        <stop offset="60%" stop-color="#15803d" />
        <stop offset="100%" stop-color="#166534" />
      </linearGradient>
      <linearGradient id="soilGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#78350f" />
        <stop offset="100%" stop-color="#451a03" />
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
      </pattern>
    </defs>

    <!-- Background / Sky -->
    <rect width="800" height="600" fill="url(#skyGrad)" />

    <!-- Scene Layer (Blur applied if low quality) -->
    <g ${filterAttr}>
      <!-- Far Mountains & Horizon -->
      <path d="M0 320 Q 200 280 400 310 T 800 290 L 800 600 L 0 600 Z" fill="#86efac" opacity="0.6" />
      
      <!-- Soil & Field Base -->
      <polygon points="0,350 800,350 800,600 0,600" fill="url(#soilGrad)" />
      
      <!-- Crop Rows & Foliage -->
      <g fill="url(#cropGrad)">
        <polygon points="0,380 800,360 800,600 0,600" opacity="0.9" />
        <ellipse cx="200" cy="460" rx="180" ry="120" />
        <ellipse cx="600" cy="470" rx="190" ry="130" />
        <ellipse cx="400" cy="490" rx="220" ry="140" fill="#15803d" />
      </g>

      <!-- Simulated Specific Angle Perspective -->
      ${
        angle === "closeup_damage"
          ? `
        <!-- Macro Close-up Botanical Leaf Overlay -->
        <path d="M150,550 C200,220 600,180 650,550 C500,580 300,580 150,550 Z" fill="#4ade80" stroke="#166534" stroke-width="4" />
        <path d="M400,200 L400,560" stroke="#15803d" stroke-width="6" stroke-linecap="round" />
        <path d="M400,280 L280,240 M400,350 L250,320 M400,420 L260,400" stroke="#15803d" stroke-width="3" />
        <path d="M400,280 L520,240 M400,350 L550,320 M400,420 L540,400" stroke="#15803d" stroke-width="3" />
        
        <!-- Disease / Pest Lesions / Pustules -->
        <circle cx="340" cy="300" r="28" fill="#ca8a04" opacity="0.85" />
        <circle cx="340" cy="300" r="14" fill="#713f12" />
        <circle cx="480" cy="380" r="35" fill="#ca8a04" opacity="0.85" />
        <circle cx="480" cy="380" r="18" fill="#713f12" />
        <ellipse cx="380" cy="440" rx="42" ry="24" fill="#dc2626" opacity="0.75" />
        <ellipse cx="380" cy="440" rx="22" ry="12" fill="#7f1d1d" />

        <!-- AI Bounding Box Detection -->
        <rect x="290" y="250" width="110" height="100" fill="none" stroke="#e11d48" stroke-width="3" stroke-dasharray="6,4" />
        <rect x="290" y="226" width="110" height="24" fill="#e11d48" />
        <text x="295" y="243" fill="#ffffff" font-family="monospace" font-size="12" font-weight="bold">${damageType.toUpperCase()} (94%)</text>
      `
          : angle === "mid_canopy"
          ? `
        <!-- Mid Canopy Stalks -->
        <rect x="180" y="320" width="20" height="280" fill="#166534" />
        <rect x="390" y="300" width="24" height="300" fill="#15803d" />
        <rect x="580" y="330" width="20" height="270" fill="#166534" />
        <ellipse cx="400" cy="380" rx="90" ry="45" fill="#22c55e" opacity="0.9" />
        <ellipse cx="300" cy="420" rx="80" ry="40" fill="#16a34a" opacity="0.9" />
        <ellipse cx="500" cy="410" rx="85" ry="42" fill="#16a34a" opacity="0.9" />
      `
          : `
        <!-- Wide Perspective Grid & Horizon Overlay -->
        <rect width="800" height="600" fill="url(#grid)" />
      `
      }
    </g>

    <!-- Blur Warning Badge if applicable -->
    ${
      isBlurry
        ? `
      <rect x="200" y="240" width="400" height="120" rx="8" fill="rgba(15, 23, 42, 0.88)" stroke="#f59e0b" stroke-width="2" />
      <text x="400" y="285" fill="#f59e0b" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">⚠️ BLURRY CANOPY DETECTED</text>
      <text x="400" y="315" fill="#f8fafc" font-family="sans-serif" font-size="14" text-anchor="middle">Laplacian Variance: 34 / 100 (Threshold: 80)</text>
      <text x="400" y="338" fill="#cbd5e1" font-family="sans-serif" font-size="12" text-anchor="middle">Uncertainty Engine: Visual Quality Uncertainty</text>
    `
        : ""
    }

    <!-- UI Overlay Header -->
    <rect x="0" y="0" width="800" height="64" fill="rgba(15, 23, 42, 0.85)" />
    <text x="20" y="30" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold">${title}</text>
    <text x="20" y="50" fill="#94a3b8" font-family="monospace" font-size="12">CROP: ${crop.toUpperCase()} · DIAGNOSIS: ${damageType.replace(/_/g, " ").toUpperCase()}</text>

    <!-- Bottom Telemetry HUD -->
    <rect x="0" y="540" width="800" height="60" fill="rgba(15, 23, 42, 0.9)" />
    <circle cx="30" cy="570" r="8" fill="${stampColor}" />
    <text x="48" y="575" fill="#ffffff" font-family="monospace" font-size="12" font-weight="bold">${stampText}</text>
    <text x="780" y="575" fill="#94a3b8" font-family="monospace" font-size="11" text-anchor="end">LAT: 20.9042° N | LON: 75.3489° E | ALT: 214m | UTC+05:30</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface CanonicalScenario {
  id: string;
  submissionId: string;
  badge: string;
  badgeTone: "ok" | "warn" | "danger" | "neutral";
  title: string;
  hindiTitle: string;
  subtitle: string;
  hindiSubtitle: string;
  description: string;
  farmerName: string;
  location: string;
  crop: string;
  damage: string;
  registeredCrop: string;
  evidenceScore: number;
  modelScore: number;
  uncertaintyType: string;
  recommendedAction: string;
  status: string;
  keyFinding: string;
  anglesCount: string;
  reviewUrl: string;
  farmerUrl: string;
}

export const CANONICAL_SCENARIOS: CanonicalScenario[] = [
  {
    id: "case-1-high-trust",
    submissionId: "sub-pmfby-2026-c1-hightrust",
    badge: "FAST-TRACK APPROVE",
    badgeTone: "ok",
    title: "Case 1: Complete High-Trust Claim",
    hindiTitle: "केस 1: पूर्ण उच्च-विश्वास दावा",
    subtitle: "Pristine 5 angles, high confidence, fast-tracked",
    hindiSubtitle: "स्वच्छ 5 कोण, उच्च आत्मविश्वास, त्वरित सत्यापन",
    description:
      "All 5 required angles uploaded with full cryptographic integrity, high sharpness, valid GPS geofence, and high vision model agreement. Fast-tracked for instant approval.",
    farmerName: "Ramesh Patil",
    location: "Jalgaon, Maharashtra (Gat 142/2)",
    crop: "Paddy / Rice (IR-64)",
    registeredCrop: "Paddy / Rice",
    damage: "Bacterial Leaf Blight (Grade B - 28% area)",
    evidenceScore: 94.8,
    modelScore: 93.5,
    uncertaintyType: "None (Pristine Evidence)",
    recommendedAction: "Accept AI Result / Fast-track",
    status: "verified",
    keyFinding:
      "All 5 angles present, 0 blur warnings, 100% integrity check passed, perfect plot boundary match.",
    anglesCount: "5/5 Pristine",
    reviewUrl: "/review/sub-pmfby-2026-c1-hightrust",
    farmerUrl: "/farmer?scenario=case-1-high-trust",
  },
  {
    id: "case-2-blurry-canopy",
    submissionId: "sub-pmfby-2026-c2-blurry",
    badge: "QUALITY UNCERTAINTY",
    badgeTone: "warn",
    title: "Case 2: Blurry Mid-Canopy",
    hindiTitle: "केस 2: धुंधला मिड-कैनोपी फोटो",
    subtitle: "Quality uncertainty -> targeted retake request",
    hindiSubtitle: "गुणवत्ता अनिश्चितता -> पुनः फोटो अनुरोध",
    description:
      "The Mid-Canopy image fails sharpness threshold due to hand movement blur during capture (Laplacian 34/100). The engine triggers a single-photo targeted retake request.",
    farmerName: "Devendra Deshmukh",
    location: "Wardha, Maharashtra (Gat 88/1)",
    crop: "Cotton (Bt Cotton RCH-2)",
    registeredCrop: "Cotton",
    damage: "Boll Rot (Spodoptera Littoralis)",
    evidenceScore: 64.2,
    modelScore: 71.0,
    uncertaintyType: "Visual Quality (Mid-Canopy Blur)",
    recommendedAction: "Retake Specific Angle (mid_canopy)",
    status: "needs_recapture",
    keyFinding:
      "Mid-canopy image variance 34 < threshold 80. Engine requests single angle re-take without re-doing all 5 photos.",
    anglesCount: "5/5 (1 Blurry)",
    reviewUrl: "/review/sub-pmfby-2026-c2-blurry",
    farmerUrl: "/farmer?scenario=case-2-blurry-canopy",
  },
  {
    id: "case-3-missing-closeup",
    submissionId: "sub-pmfby-2026-c3-missing-angle",
    badge: "COVERAGE UNCERTAINTY",
    badgeTone: "warn",
    title: "Case 3: Missing Close-up Damage",
    hindiTitle: "केस 3: क्लोज़-अप क्षति कोण गायब",
    subtitle: "Coverage uncertainty -> targeted recapture",
    hindiSubtitle: "कवरेज अनिश्चितता -> लक्षित पुनः कैप्चर",
    description:
      "The farmer uploaded 4 wide and context shots but omitted the mandatory close-up macro damage angle. System isolates missing view and routes a one-click targeted recapture.",
    farmerName: "Mahender Singh",
    location: "Alwar, Rajasthan (Khasra 402)",
    crop: "Mustard (Brassica Juncea)",
    registeredCrop: "Mustard",
    damage: "White Rust & Alternaria Blight",
    evidenceScore: 58.4,
    modelScore: 66.0,
    uncertaintyType: "Coverage (Missing Close-up Damage)",
    recommendedAction: "Request Specific Evidence (closeup_damage)",
    status: "needs_recapture",
    keyFinding:
      "Omission of macro leaf view reduces coverage score to 55%. Adaptive recapture prompt generated for farmer mobile app.",
    anglesCount: "4/5 (Missing Closeup)",
    reviewUrl: "/review/sub-pmfby-2026-c3-missing-angle",
    farmerUrl: "/farmer?scenario=case-3-missing-closeup",
  },
  {
    id: "case-4-crop-mismatch",
    submissionId: "sub-pmfby-2026-c4-mismatch",
    badge: "CONTEXT MISMATCH",
    badgeTone: "danger",
    title: "Case 4: Crop Cycle Mismatch",
    hindiTitle: "केस 4: फसल चक्र बेमेल (Mismatch)",
    subtitle: "AI detected Wheat on Maize plot -> physical inspection",
    hindiSubtitle: "AI ने मक्का के भूखंड पर गेहूं पाया -> भौतिक निरीक्षण",
    description:
      "PMFBY policy is registered for Kharif Maize, but AI Vision Transformer classifies field as vegetative Wheat with 96.8% confidence. Context engine triggers physical field inspection.",
    farmerName: "Surender Kumar",
    location: "Karnal, Haryana (Murabba 24)",
    crop: "Wheat (Triticum aestivum - Detected)",
    registeredCrop: "Maize (Kharif Registered)",
    damage: "Nitrogen Deficiency / Severe Yellowing",
    evidenceScore: 48.6,
    modelScore: 96.8,
    uncertaintyType: "Context (Crop Discrepancy)",
    recommendedAction: "Physical Inspection Required",
    status: "physical_inspection",
    keyFinding:
      "Registered crop (Maize) diverges from botanical inference (Wheat). Automatic flag prevents improper policy payout.",
    anglesCount: "5/5 Complete",
    reviewUrl: "/review/sub-pmfby-2026-c4-mismatch",
    farmerUrl: "/farmer?scenario=case-4-crop-mismatch",
  },
  {
    id: "case-5-duplicate-tamper",
    submissionId: "sub-pmfby-2026-c5-tamper",
    badge: "INTEGRITY FAILURE",
    badgeTone: "danger",
    title: "Case 5: Duplicate Photo Tamper / Mock GPS",
    hindiTitle: "केस 5: डुप्लिकेट फोटो छेड़छाड़ / नकली GPS",
    subtitle: "Integrity failure -> safety block & fraud flag",
    hindiSubtitle: "सत्यनिष्ठा विफलता -> सुरक्षा ब्लॉक एवं धोखाधड़ी ध्वज",
    description:
      "Perceptual image hash matches an old claim from a different district, combined with Mock GPS Provider flag. Safety protocol halts claim processing with an immutable audit alert.",
    farmerName: "Vikas Rawat",
    location: "Indore, Madhya Pradesh (Survey 71)",
    crop: "Soybean (JS 335)",
    registeredCrop: "Soybean",
    damage: "Stem Borer (80% Loss Claimed)",
    evidenceScore: 18.2,
    modelScore: 84.0,
    uncertaintyType: "Integrity (Mock GPS & Hash Collision)",
    recommendedAction: "Safety Block / Reject Fraudulent Evidence",
    status: "rejected",
    keyFinding:
      "Device reported mock coordinates; perceptual dHash matches 2024 submission from Dewas. Automatic fraud isolation.",
    anglesCount: "5/5 (Spoofed)",
    reviewUrl: "/review/sub-pmfby-2026-c5-tamper",
    farmerUrl: "/farmer?scenario=case-5-duplicate-tamper",
  },
  {
    id: "case-6-resolved-delta",
    submissionId: "sub-pmfby-2026-c6-resolved",
    badge: "RESOLVED DELTA (+24%)",
    badgeTone: "ok",
    title: "Case 6: Resolved Recapture Delta",
    hindiTitle: "केस 6: हल किया गया पुनः कैप्चर डेल्टा (+24%)",
    subtitle: "+24% confidence improvement on single-photo recapture",
    hindiSubtitle: "एकल फोटो पुनः कैप्चर पर +24% विश्वास सुधार",
    description:
      "Initial claim had coverage uncertainty (62.0% score). Following reviewer's targeted 1-angle request, the farmer submitted a high-res macro angle, elevating evidence confidence to 86.4%.",
    farmerName: "Arvind Patel",
    location: "Rajkot, Gujarat (Survey 310)",
    crop: "Groundnut (GG-20)",
    registeredCrop: "Groundnut",
    damage: "Tikka Leaf Spot (Cercospora arachidicola)",
    evidenceScore: 86.4,
    modelScore: 88.2,
    uncertaintyType: "Coverage (Resolved with +24.4% Delta)",
    recommendedAction: "Verified - Delta Resolved",
    status: "verified",
    keyFinding:
      "Single-photo targeted recapture resolved uncertainty without requiring full field visit. Confidence jumped from 62.0% to 86.4%.",
    anglesCount: "5/5 (Resolved)",
    reviewUrl: "/review/sub-pmfby-2026-c6-resolved",
    farmerUrl: "/farmer?scenario=case-6-resolved-delta",
  },
];

export const SHOWCASE_SUBMISSIONS: Record<string, Submission> = {
  "sub-pmfby-2026-c1-hightrust": {
    id: "sub-pmfby-2026-c1-hightrust",
    crop_cycle_id: "cycle-mh-paddy-2026-01",
    status: "verified",
    capture_lat: 20.9042,
    capture_lon: 75.3489,
    capture_accuracy_m: 8.5,
    farmer_observations:
      "Severe yellow-brown bacterial leaf streaks appearing across the northern side of Gat 142/2 after heavy monsoon rainfall.",
    severity: "medium",
    final_severity: "medium",
    final_assessment_notes:
      "All 5 angles confirmed pristine. Bacterial Leaf Blight detected with 28% affected leaf area. Fast-track approval granted.",
    images: [
      {
        id: "img-c1-1",
        angle_type: "wide_field",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("wide_field", "Paddy", "Bacterial Blight", false, false, 96),
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      {
        id: "img-c1-2",
        angle_type: "left_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("left_context", "Paddy", "Bacterial Blight", false, false, 95),
        sha256: "d41d8cd98f00b204e9800998ecf8427e99b2bb6f0f5b4d1b827e28f3ef0175b2",
      },
      {
        id: "img-c1-3",
        angle_type: "mid_canopy",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("mid_canopy", "Paddy", "Bacterial Blight", false, false, 94),
        sha256: "7acba622a59a1f28b4c062828b8cf4489375b4f2c002bc0f1f456c253818e697",
      },
      {
        id: "img-c1-4",
        angle_type: "right_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("right_context", "Paddy", "Bacterial Blight", false, false, 95),
        sha256: "2f8b5a0349b1e9c8f0e5b8d27a1c43f6e80b2a5d9c7e1f4a3b6c8e0d2f4a6b8c",
      },
      {
        id: "img-c1-5",
        angle_type: "closeup_damage",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("closeup_damage", "Paddy", "Bacterial Blight", false, false, 97),
        sha256: "5d41402abc4b2a76b9719d911017c59218d6a894b9f27c8a6f4e1b3d5c7a9e0f",
      },
    ],
    latest_prediction: {
      model_version: "v2.4-pmfby-prod",
      adapter_type: "crop_vit_multimodal",
      is_production_validated: true,
      promotion_status: "production_certified",
      predicted_crop: "paddy",
      crop_confidence: 0.985,
      predicted_growth_stage: "tillering_to_panicle",
      predicted_grade: "B",
      grade_label: "PMFBY Grade B (Moderate Partial Loss)",
      grade_confidence: 0.935,
      grade_scores: { A: 0.04, B: 0.935, C: 0.025, U: 0.0 },
      primary_damage: "bacterial_leaf_blight",
      severity: "medium",
      overall_confidence: 0.935,
      affected_area_pct: 28.0,
      damage_scores: {
        bacterial_leaf_blight: 0.935,
        brown_spot: 0.042,
        leaf_blast: 0.018,
        sheath_rot: 0.005,
      },
      quality_warnings: [],
      anomaly_flags: [],
      human_review_recommendation: "Fast-track approval recommended; high evidence and model agreement.",
    },
    latest_evaluation: {
      id: "ev-c1",
      submission_id: "sub-pmfby-2026-c1-hightrust",
      evaluation_version: "v2.1",
      confidence: {
        final: 94.8,
        threshold: 80.0,
        quality: 96.0,
        coverage: 100.0,
        context: 98.0,
        integrity: 100.0,
      },
      quality: {
        score: 96.0,
        available: true,
        details: {
          blur_score: 95.0,
          brightness_score: 92.0,
          resolution_score: 98.0,
          framing_score: 96.0,
          crop_visibility: true,
          damage_visibility: true,
          consistency_score: 96.0,
          issues: [],
        },
      },
      coverage: {
        score: 100.0,
        available: true,
        details: {
          views_present: 5,
          views_required: 5,
          required_views: ["wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"],
          usable_views: ["wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"],
          missing_views: [],
          wide_context: true,
          closeup_damage: true,
        },
      },
      context: {
        score: 98.0,
        available: true,
        details: {
          gps_valid: true,
          gps_accuracy_m: 8.5,
          plot_match: true,
          capture_time_valid: true,
          crop_context_matched: true,
          weather_status: "normal",
          distance_to_plot_m: 4.2,
        },
      },
      integrity: {
        score: 100.0,
        available: true,
        details: {
          metadata_valid: true,
          sha256_verified: true,
          duplicate_detected: false,
          perceptual_duplicate: false,
          authenticity_verified: true,
          tamper_check_passed: true,
          server_check_passed: true,
          is_mock_location: false,
          flags: [],
        },
      },
      uncertainty: {
        present: false,
        type: "none",
        severity: "low",
        reasons: [],
        recommended_action: "none",
      },
      request: null,
      model_version: "v2.4-pmfby-prod",
    },
  },

  "sub-pmfby-2026-c2-blurry": {
    id: "sub-pmfby-2026-c2-blurry",
    crop_cycle_id: "cycle-mh-cotton-2026-04",
    status: "needs_recapture",
    capture_lat: 20.7453,
    capture_lon: 78.6022,
    capture_accuracy_m: 11.2,
    farmer_observations:
      "Cotton bolls rotting at bottom canopy. Captured 5 photos during windy afternoon.",
    severity: "high",
    final_severity: null,
    final_assessment_notes: null,
    images: [
      {
        id: "img-c2-1",
        angle_type: "wide_field",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("wide_field", "Cotton", "Boll Rot", false, false, 88),
      },
      {
        id: "img-c2-2",
        angle_type: "left_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("left_context", "Cotton", "Boll Rot", false, false, 85),
      },
      {
        id: "img-c2-3",
        angle_type: "mid_canopy",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("mid_canopy", "Cotton", "Boll Rot", true, false, 45),
        quality_flags: { blur_score: 34, issue: "Motion blur detected (Laplacian variance 34)" },
      },
      {
        id: "img-c2-4",
        angle_type: "right_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("right_context", "Cotton", "Boll Rot", false, false, 87),
      },
      {
        id: "img-c2-5",
        angle_type: "closeup_damage",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("closeup_damage", "Cotton", "Boll Rot", false, false, 89),
      },
    ],
    latest_prediction: {
      model_version: "v2.4-pmfby-prod",
      adapter_type: "crop_vit_multimodal",
      is_production_validated: true,
      predicted_crop: "cotton",
      crop_confidence: 0.94,
      predicted_growth_stage: "boll_formation",
      predicted_grade: "B",
      grade_label: "PMFBY Grade B",
      grade_confidence: 0.71,
      primary_damage: "boll_rot",
      severity: "high",
      overall_confidence: 0.71,
      affected_area_pct: 42.0,
      quality_warnings: ["Image mid_canopy failed blur sharpness threshold (Laplacian score 34/100)"],
      anomaly_flags: ["IMAGE_BLUR_MID_CANOPY"],
      human_review_recommendation: "Request targeted recapture of mid_canopy angle.",
    },
    latest_evaluation: {
      id: "ev-c2",
      submission_id: "sub-pmfby-2026-c2-blurry",
      evaluation_version: "v2.1",
      confidence: {
        final: 64.2,
        threshold: 80.0,
        quality: 52.0,
        coverage: 95.0,
        context: 92.0,
        integrity: 98.0,
      },
      quality: {
        score: 52.0,
        available: true,
        details: {
          blur_score: 34.0,
          brightness_score: 86.0,
          resolution_score: 92.0,
          framing_score: 70.0,
          issues: ["Mid-canopy image failed sharpness threshold (Laplacian score 34/100)"],
        },
      },
      coverage: {
        score: 95.0,
        available: true,
        details: {
          views_present: 5,
          views_required: 5,
          missing_views: [],
          wide_context: true,
          closeup_damage: true,
        },
      },
      context: {
        score: 92.0,
        available: true,
        details: { gps_valid: true, gps_accuracy_m: 11.2, plot_match: true, crop_context_matched: true },
      },
      integrity: {
        score: 98.0,
        available: true,
        details: { tamper_check_passed: true, duplicate_detected: false, is_mock_location: false },
      },
      uncertainty: {
        present: true,
        type: "visual",
        severity: "medium",
        reasons: ["Mid-canopy image exhibits severe camera motion blur, hindering disease severity diagnosis."],
        recommended_action: "retake_image",
      },
      request: {
        type: "retake_single_angle",
        required_angles: ["mid_canopy"],
        title: "Mid-Canopy Photo Sharpness Retake",
        instructions: "Please hold the camera steady and recapture the Mid-Canopy view showing boll clusters.",
      },
    },
  },

  "sub-pmfby-2026-c3-missing-angle": {
    id: "sub-pmfby-2026-c3-missing-angle",
    crop_cycle_id: "cycle-rj-mustard-2026-11",
    status: "needs_recapture",
    capture_lat: 27.553,
    capture_lon: 76.6346,
    capture_accuracy_m: 9.0,
    farmer_observations: "White powdery rust pustules on mustard leaves.",
    severity: "medium",
    images: [
      {
        id: "img-c3-1",
        angle_type: "wide_field",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("wide_field", "Mustard", "White Rust", false, false, 91),
      },
      {
        id: "img-c3-2",
        angle_type: "left_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("left_context", "Mustard", "White Rust", false, false, 90),
      },
      {
        id: "img-c3-3",
        angle_type: "mid_canopy",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("mid_canopy", "Mustard", "White Rust", false, false, 89),
      },
      {
        id: "img-c3-4",
        angle_type: "right_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("right_context", "Mustard", "White Rust", false, false, 90),
      },
    ],
    latest_prediction: {
      model_version: "v2.4-pmfby-prod",
      adapter_type: "crop_vit_multimodal",
      is_production_validated: true,
      predicted_crop: "mustard",
      crop_confidence: 0.95,
      predicted_growth_stage: "flowering",
      predicted_grade: "C",
      grade_label: "PMFBY Grade C",
      grade_confidence: 0.66,
      primary_damage: "white_rust",
      severity: "medium",
      overall_confidence: 0.66,
      affected_area_pct: 35.0,
      quality_warnings: ["Close-up damage angle is missing; cannot confirm microscopic pustule density."],
      anomaly_flags: ["MISSING_CRITICAL_CLOSEUP_VIEW"],
      human_review_recommendation: "Request targeted 1-angle recapture of Closeup Damage view.",
    },
    latest_evaluation: {
      id: "ev-c3",
      submission_id: "sub-pmfby-2026-c3-missing-angle",
      evaluation_version: "v2.1",
      confidence: {
        final: 58.4,
        threshold: 80.0,
        quality: 91.0,
        coverage: 55.0,
        context: 94.0,
        integrity: 99.0,
      },
      quality: { score: 91.0, available: true, details: { issues: [] } },
      coverage: {
        score: 55.0,
        available: true,
        details: {
          views_present: 4,
          views_required: 5,
          missing_views: ["closeup_damage"],
          wide_context: true,
          closeup_damage: false,
        },
      },
      context: { score: 94.0, available: true, details: { gps_valid: true, plot_match: true } },
      integrity: { score: 99.0, available: true, details: { tamper_check_passed: true } },
      uncertainty: {
        present: true,
        type: "coverage",
        severity: "high",
        reasons: ["Critical Angle 5 (Closeup Damage) omitted. Macro pathology classification requires high-res lesion view."],
        recommended_action: "request_specific_evidence",
      },
      request: {
        type: "request_specific_evidence",
        required_angles: ["closeup_damage"],
        title: "Close-up Macro Damage Angle Needed",
        instructions: "Please photograph a single affected leaf with visible white pustules from 15-20cm distance.",
      },
    },
  },

  "sub-pmfby-2026-c4-mismatch": {
    id: "sub-pmfby-2026-c4-mismatch",
    crop_cycle_id: "cycle-hr-maize-2026-08",
    status: "physical_inspection",
    capture_lat: 29.6857,
    capture_lon: 76.9905,
    capture_accuracy_m: 7.2,
    farmer_observations: "Severe crop yellowing and stunted growth on parcel 24.",
    severity: "high",
    images: [
      {
        id: "img-c4-1",
        angle_type: "wide_field",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("wide_field", "Wheat (Conflict)", "Yellowing", false, false, 95),
      },
      {
        id: "img-c4-2",
        angle_type: "left_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("left_context", "Wheat (Conflict)", "Yellowing", false, false, 94),
      },
      {
        id: "img-c4-3",
        angle_type: "mid_canopy",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("mid_canopy", "Wheat (Conflict)", "Yellowing", false, false, 96),
      },
      {
        id: "img-c4-4",
        angle_type: "right_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("right_context", "Wheat (Conflict)", "Yellowing", false, false, 95),
      },
      {
        id: "img-c4-5",
        angle_type: "closeup_damage",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("closeup_damage", "Wheat (Conflict)", "Yellowing", false, false, 97),
      },
    ],
    latest_prediction: {
      model_version: "v2.4-pmfby-prod",
      adapter_type: "crop_vit_multimodal",
      is_production_validated: true,
      predicted_crop: "wheat",
      crop_confidence: 0.968,
      predicted_growth_stage: "tillering",
      predicted_grade: "C",
      grade_label: "PMFBY Grade C",
      grade_confidence: 0.92,
      primary_damage: "nutrient_deficiency_yellowing",
      severity: "high",
      overall_confidence: 0.968,
      affected_area_pct: 65.0,
      quality_warnings: ["Registered crop policy specifies 'Maize', but Vision AI detects 'Wheat' (96.8% certainty)."],
      anomaly_flags: ["CROP_SPECIES_MISMATCH_WITH_LAND_RECORD"],
      human_review_recommendation: "Escalate to Agriculture Officer for physical plot boundary inspection.",
    },
    latest_evaluation: {
      id: "ev-c4",
      submission_id: "sub-pmfby-2026-c4-mismatch",
      evaluation_version: "v2.1",
      confidence: {
        final: 48.6,
        threshold: 80.0,
        quality: 90.0,
        coverage: 92.0,
        context: 35.0,
        integrity: 95.0,
      },
      quality: { score: 90.0, available: true },
      coverage: { score: 92.0, available: true, details: { views_present: 5, views_required: 5 } },
      context: {
        score: 35.0,
        available: true,
        details: {
          gps_valid: true,
          crop_context_matched: false,
          issues: ["Registered crop: Maize. Botanical prediction: Wheat (96.8% conf). Sowing calendar conflict."],
        },
      },
      integrity: { score: 95.0, available: true },
      uncertainty: {
        present: true,
        type: "context",
        severity: "critical",
        reasons: ["Crop species discrepancy: Farmer claimed PMFBY Maize loss, but photos clearly show Wheat canopy."],
        recommended_action: "physical_inspection",
      },
      request: null,
    },
  },

  "sub-pmfby-2026-c5-tamper": {
    id: "sub-pmfby-2026-c5-tamper",
    crop_cycle_id: "cycle-mp-soybean-2026-09",
    status: "rejected",
    capture_lat: 22.7196,
    capture_lon: 75.8577,
    capture_accuracy_m: 1.0,
    farmer_observations: "Complete stem borer infestation across entire survey 71.",
    severity: "high",
    images: [
      {
        id: "img-c5-1",
        angle_type: "wide_field",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("wide_field", "Soybean", "Stem Borer", false, true, 20),
      },
      {
        id: "img-c5-2",
        angle_type: "left_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("left_context", "Soybean", "Stem Borer", false, true, 18),
      },
      {
        id: "img-c5-3",
        angle_type: "mid_canopy",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("mid_canopy", "Soybean", "Stem Borer", false, true, 19),
      },
      {
        id: "img-c5-4",
        angle_type: "right_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("right_context", "Soybean", "Stem Borer", false, true, 18),
      },
      {
        id: "img-c5-5",
        angle_type: "closeup_damage",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("closeup_damage", "Soybean", "Stem Borer", false, true, 15),
      },
    ],
    latest_prediction: {
      model_version: "v2.4-pmfby-prod",
      adapter_type: "crop_vit_multimodal",
      is_production_validated: true,
      predicted_crop: "soybean",
      crop_confidence: 0.84,
      predicted_growth_stage: "pod_formation",
      predicted_grade: "A",
      grade_label: "PMFBY Grade A (Severe)",
      grade_confidence: 0.84,
      primary_damage: "stem_borer",
      severity: "high",
      overall_confidence: 0.84,
      affected_area_pct: 80.0,
      quality_warnings: ["Integrity flags present: Mock GPS detected & perceptual image hash collision."],
      anomaly_flags: ["MOCK_LOCATION_DETECTED", "IMAGE_PERCEPTUAL_HASH_DUPLICATE"],
      human_review_recommendation: "Reject submission due to fraudulent telemetry & recycled photos.",
    },
    latest_evaluation: {
      id: "ev-c5",
      submission_id: "sub-pmfby-2026-c5-tamper",
      evaluation_version: "v2.1",
      confidence: {
        final: 18.2,
        threshold: 80.0,
        quality: 78.0,
        coverage: 85.0,
        context: 20.0,
        integrity: 12.0,
      },
      quality: { score: 78.0, available: true },
      coverage: { score: 85.0, available: true },
      context: { score: 20.0, available: true, details: { gps_valid: false } },
      integrity: {
        score: 12.0,
        available: true,
        details: {
          metadata_valid: false,
          sha256_verified: true,
          duplicate_detected: true,
          is_mock_location: true,
          flags: [
            "MOCK_GPS_PROVIDER_ACTIVE (MockLocationFlag=true)",
            "PERCEPTUAL_HASH_COLLISION (Matches claim sub-mp-2024-884 from Dewas)",
            "EXIF_TIMESTAMP_FUTURE_OFFSET (+48 hours)",
          ],
        },
      },
      uncertainty: {
        present: true,
        type: "integrity",
        severity: "critical",
        reasons: [
          "Device location provider spoofing detected (Mock GPS).",
          "Photo perceptual hash matches previously settled claim in another district.",
        ],
        recommended_action: "safety_block",
      },
      request: null,
    },
  },

  "sub-pmfby-2026-c6-resolved": {
    id: "sub-pmfby-2026-c6-resolved",
    crop_cycle_id: "cycle-gj-groundnut-2026-05",
    status: "verified",
    capture_lat: 22.3039,
    capture_lon: 70.8022,
    capture_accuracy_m: 6.4,
    farmer_observations: "Tikka leaf spots on groundnut. Recaptured Angle 5 as requested by reviewer.",
    severity: "medium",
    final_severity: "medium",
    final_assessment_notes: "Targeted single-angle recapture received. Confidence improved by +24.4%. Claim approved.",
    images: [
      {
        id: "img-c6-1",
        angle_type: "wide_field",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("wide_field", "Groundnut", "Tikka Leaf Spot", false, false, 92),
      },
      {
        id: "img-c6-2",
        angle_type: "left_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("left_context", "Groundnut", "Tikka Leaf Spot", false, false, 91),
      },
      {
        id: "img-c6-3",
        angle_type: "mid_canopy",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("mid_canopy", "Groundnut", "Tikka Leaf Spot", false, false, 93),
      },
      {
        id: "img-c6-4",
        angle_type: "right_context",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("right_context", "Groundnut", "Tikka Leaf Spot", false, false, 90),
      },
      {
        id: "img-c6-5-recaptured",
        angle_type: "closeup_damage",
        upload_status: "uploaded",
        download_url: generateMockCropSvg("closeup_damage", "Groundnut", "Tikka Leaf Spot", false, false, 98),
      },
    ],
    latest_prediction: {
      model_version: "v2.4-pmfby-prod",
      adapter_type: "crop_vit_multimodal",
      is_production_validated: true,
      predicted_crop: "groundnut",
      crop_confidence: 0.97,
      predicted_growth_stage: "peg_formation",
      predicted_grade: "B",
      grade_label: "PMFBY Grade B",
      grade_confidence: 0.882,
      primary_damage: "tikka_leaf_spot",
      severity: "medium",
      overall_confidence: 0.882,
      affected_area_pct: 32.0,
      quality_warnings: [],
      anomaly_flags: [],
      human_review_recommendation: "Recapture resolved uncertainty. Ready for final claim verification.",
    },
    latest_evaluation: {
      id: "ev-c6",
      submission_id: "sub-pmfby-2026-c6-resolved",
      evaluation_version: "v2.1",
      confidence: {
        final: 86.4,
        threshold: 80.0,
        quality: 94.0,
        coverage: 100.0,
        context: 96.0,
        integrity: 99.0,
      },
      confidence_delta: 24.4,
      previous_confidence: 62.0,
      previous_uncertainty: "coverage",
      quality: { score: 94.0, available: true },
      coverage: {
        score: 100.0,
        available: true,
        details: { views_present: 5, views_required: 5, missing_views: [], closeup_damage: true },
      },
      context: { score: 96.0, available: true, details: { gps_valid: true } },
      integrity: { score: 99.0, available: true, details: { tamper_check_passed: true } },
      uncertainty: {
        present: false,
        type: "none",
        severity: "low",
        reasons: [],
        recommended_action: "none",
      },
      request: null,
    },
  },
};

export const SHOWCASE_OVERVIEW: Overview = {
  total_submissions: 1248,
  submissions_today: 47,
  pending_ai_processing: 3,
  pending_human_review: 18,
  verified_assessments: 1184,
  recapture_requests: 38,
  high_severity_cases: 74,
  average_processing_seconds: 4.8,
  most_affected_crop: "Paddy / Rice (Kharif)",
  most_affected_district: "Jalgaon, Maharashtra",
  low_confidence_rate: 0.082,
  submission_failure_rate: 0.014,
  average_evidence_confidence: 84.6,
  low_evidence_confidence_cases: 12,
  visual_uncertainty_cases: 6,
  coverage_uncertainty_cases: 8,
  context_uncertainty_cases: 3,
  integrity_flags: 2,
  recapture_rate: 0.0304,
  evidence_resolution_rate: 0.948,
  avg_confidence_improvement: 22.8,
};

export const SHOWCASE_MAP_MARKERS: MapMarker[] = [
  {
    id: "sub-pmfby-2026-c1-hightrust",
    lat: 20.9042,
    lon: 75.3489,
    status: "verified",
    severity: "medium",
    crop_code: "paddy",
    primary_damage: "bacterial_leaf_blight",
    confidence: 0.935,
    created_at: "2026-08-17T10:15:00Z",
  },
  {
    id: "sub-pmfby-2026-c2-blurry",
    lat: 20.7453,
    lon: 78.6022,
    status: "needs_recapture",
    severity: "high",
    crop_code: "cotton",
    primary_damage: "boll_rot",
    confidence: 0.71,
    created_at: "2026-08-17T11:42:00Z",
  },
  {
    id: "sub-pmfby-2026-c3-missing-angle",
    lat: 27.553,
    lon: 76.6346,
    status: "needs_recapture",
    severity: "medium",
    crop_code: "mustard",
    primary_damage: "white_rust",
    confidence: 0.66,
    created_at: "2026-08-17T09:20:00Z",
  },
  {
    id: "sub-pmfby-2026-c4-mismatch",
    lat: 29.6857,
    lon: 76.9905,
    status: "physical_inspection",
    severity: "high",
    crop_code: "wheat",
    primary_damage: "species_discrepancy",
    confidence: 0.968,
    created_at: "2026-08-17T12:05:00Z",
  },
  {
    id: "sub-pmfby-2026-c5-tamper",
    lat: 22.7196,
    lon: 75.8577,
    status: "rejected",
    severity: "high",
    crop_code: "soybean",
    primary_damage: "integrity_spoofed_gps",
    confidence: 0.18,
    created_at: "2026-08-17T08:30:00Z",
  },
  {
    id: "sub-pmfby-2026-c6-resolved",
    lat: 22.3039,
    lon: 70.8022,
    status: "verified",
    severity: "medium",
    crop_code: "groundnut",
    primary_damage: "tikka_leaf_spot",
    confidence: 0.882,
    created_at: "2026-08-17T14:10:00Z",
  },
  {
    id: "sub-extra-1",
    lat: 30.901,
    lon: 75.8573,
    status: "verified",
    severity: "low",
    crop_code: "paddy",
    primary_damage: "leaf_folder",
    confidence: 0.91,
    created_at: "2026-08-17T07:15:00Z",
  },
  {
    id: "sub-extra-2",
    lat: 10.787,
    lon: 79.1378,
    status: "verified",
    severity: "medium",
    crop_code: "paddy",
    primary_damage: "brown_planthopper",
    confidence: 0.89,
    created_at: "2026-08-17T13:40:00Z",
  },
];

export const SHOWCASE_ALERTS = [
  {
    id: "alert-1",
    alert_type: "INTEGRITY_SAFETY_BLOCK",
    severity: "CRITICAL",
    title: "Mock GPS & Recycled Photo Fraud Blocked",
    message:
      "Submission sub-pmfby-2026-c5-tamper in Indore flagged for spoofed GPS telemetry and perceptual hash collision against prior settled claim.",
    created_at: "Today, 08:30 IST",
    submission_id: "sub-pmfby-2026-c5-tamper",
  },
  {
    id: "alert-2",
    alert_type: "CROP_CYCLE_MISMATCH",
    severity: "HIGH",
    title: "Registered Policy Crop Mismatch",
    message:
      "Karnal Plot Murabba 24 registered for Maize, but AI classified field as Wheat (96.8% confidence). Physical inspection scheduled.",
    created_at: "Today, 12:05 IST",
    submission_id: "sub-pmfby-2026-c4-mismatch",
  },
  {
    id: "alert-3",
    alert_type: "RECAPTURE_RESOLVED",
    severity: "INFO",
    title: "Targeted Recapture Delta Resolved (+24.4%)",
    message:
      "Farmer Arvind Patel (Rajkot) uploaded Angle 5 macro photo. Evidence confidence reached 86.4%, fast-tracking claim approval.",
    created_at: "Today, 14:10 IST",
    submission_id: "sub-pmfby-2026-c6-resolved",
  },
];

export const SHOWCASE_ANALYTICS = {
  byCategory: [
    { category: "Bacterial & Fungal", count: 482 },
    { category: "Pest Infestation", count: 320 },
    { category: "Weather / Lodging", count: 215 },
    { category: "Nutrient / Soil", count: 142 },
    { category: "Quality / Unverified", count: 89 },
  ],
  bySeverity: [
    { severity: "Low (<25%)", count: 520 },
    { severity: "Medium (25-50%)", count: 480 },
    { severity: "High (50-75%)", count: 180 },
    { severity: "Severe (>75%)", count: 68 },
  ],
  byCrop: [
    { crop_name: "Paddy (Rice)", count: 512 },
    { crop_name: "Cotton", count: 290 },
    { crop_name: "Soybean", count: 210 },
    { crop_name: "Mustard", count: 140 },
    { crop_name: "Groundnut", count: 96 },
  ],
};

export const SHOWCASE_AUDIT_LOGS = [
  {
    id: "audit-001",
    action: "EVIDENCE_INTEGRITY_BLOCKED",
    entity_type: "submission",
    entity_id: "sub-pmfby-2026-c5-tamper",
    actor_id: "system_integrity_guard",
    created_at: "2026-08-17T08:30:12Z",
    notes: "Tamper check failed: MOCK_LOCATION detected and duplicate perceptual hash.",
  },
  {
    id: "audit-002",
    action: "RECAPTURE_REQUESTED",
    entity_type: "submission",
    entity_id: "sub-pmfby-2026-c2-blurry",
    actor_id: "reviewer_officer_04",
    created_at: "2026-08-17T11:45:00Z",
    notes: "Requested single angle retake for mid_canopy due to motion blur.",
  },
  {
    id: "audit-003",
    action: "ASSESSMENT_VERIFIED",
    entity_type: "submission",
    entity_id: "sub-pmfby-2026-c1-hightrust",
    actor_id: "reviewer_officer_02",
    created_at: "2026-08-17T10:18:45Z",
    notes: "Fast-track approval. PMFBY Grade B confirmed.",
  },
];

// In-memory or LocalStorage state storage for interactive edits in demo mode
export function getLocalShowcaseSubmissions(): Submission[] {
  if (typeof window === "undefined") {
    return Object.values(SHOWCASE_SUBMISSIONS);
  }
  try {
    const raw = localStorage.getItem("fasal_showcase_submissions");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return Object.values(SHOWCASE_SUBMISSIONS);
}

export function saveLocalShowcaseSubmissions(subs: Submission[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("fasal_showcase_submissions", JSON.stringify(subs));
  } catch {}
}

export function updateLocalSubmission(id: string, updates: Partial<Submission>): Submission {
  const all = getLocalShowcaseSubmissions();
  const index = all.findIndex((s) => s.id === id);
  const existing = index >= 0 ? all[index] : SHOWCASE_SUBMISSIONS[id] || Object.values(SHOWCASE_SUBMISSIONS)[0];
  const updated: Submission = {
    ...existing,
    ...updates,
  };
  if (index >= 0) {
    all[index] = updated;
  } else {
    all.push(updated);
  }
  saveLocalShowcaseSubmissions(all);
  return updated;
}
