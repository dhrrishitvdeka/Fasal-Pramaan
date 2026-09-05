import { z } from "zod";
import { CANONICAL_ANGLES } from "@/lib/farmerI18n";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginForm = z.infer<typeof loginSchema>;

/**
 * Shared building blocks. Zod validates structure/types/bounds only; the
 * routes keep their own clampNumber coercion for numeric fields (a schema
 * bound is a sanity ceiling, the route clamp remains authoritative).
 */
const boundedNumber = (min: number, max: number) => z.coerce.number().finite().min(min).max(max);

const trimmedNonEmpty = (max: number) =>
  z.string().trim().min(1).max(max);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

/** JSON clients send `null` for missing GPS / dates; Zod `.optional()` only allows `undefined`. */
function absentToUndefined(value: unknown): unknown {
  if (value == null || value === "") return undefined;
  return value;
}

const optionalBounded = (min: number, max: number) =>
  z.preprocess(absentToUndefined, boundedNumber(min, max).optional());

const optionalIsoDate = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  const day = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}, isoDate.optional());

const optionalTrimmed = (max: number) =>
  z.preprocess(absentToUndefined, z.string().trim().max(max).optional());

/** Matches the angle ids accepted by /api/saathi/tool (CANONICAL_ANGLES). */
const ANGLE_IDS = CANONICAL_ANGLES.map((a) => a.id) as [string, ...string[]];

/** Mirrors ALLOWED_ACTIONS in src/app/api/claims/[id]/action/route.ts. */
export const REVIEW_ACTION_IDS = [
  "accept",
  "correct",
  "request_recapture",
  "physical_inspection",
  "reject",
  "override_gate",
  "annotate",
] as const;

// ---------------------------------------------------------------------------
// POST /api/claims
// ---------------------------------------------------------------------------
export const claimImageSchema = z.object({
  imageDataUrl: z.string(),
  angleType: z.string().optional().default("closeup_damage"),
  sha256: z.string().optional(),
  lat: optionalBounded(-90, 90),
  lon: optionalBounded(-180, 180),
  accuracyM: optionalBounded(0, 100000),
  lightingScore: z.number().finite().nullish(),
  qualityPassed: z.boolean().nullish(),
  blurScore: z.number().finite().nullish(),
  greenPct: z.number().finite().nullish(),
  luma: z.number().finite().nullish(),
  cropScore: z.number().finite().nullish(),
  hintCode: z.string().max(64).nullish(),
  isScreenDetected: z.boolean().nullish(),
  isPersonDetected: z.boolean().nullish(),
  facing: z.string().nullish(),
  dimensions: z.object({ width: z.number().finite(), height: z.number().finite() }).nullish(),
  capturedAt: z.string().nullish(),
});

/** Body of POST /api/claims (1..6 images; data-URL/MIME/size checks stay in-route). */
export const claimSubmissionSchema = z.object({
  images: z.array(claimImageSchema).min(1).max(6),
  id: optionalTrimmed(128),
  plotId: z.preprocess(absentToUndefined, z.string().optional()),
  plotName: z.string().optional(),
  plotNameHi: z.string().optional(),
  khasraNumber: z.string().optional(),
  cropType: z.string().optional(),
  cropTypeHi: z.string().optional(),
  cropVariety: z.string().optional(),
  farmerObservations: z.string().optional(),
  captureLat: optionalBounded(-90, 90),
  captureLon: optionalBounded(-180, 180),
  captureAccuracyM: optionalBounded(0, 100000),
  gpsStatus: z.string().optional(),
  peril: optionalTrimmed(64),
  intentId: optionalTrimmed(128),
  plotLat: optionalBounded(-90, 90),
  plotLon: optionalBounded(-180, 180),
  sowingDate: optionalIsoDate,
  growthStage: z.string().optional(),
});

export type ClaimSubmissionBody = z.infer<typeof claimSubmissionSchema>;
export type ClaimImageInput = z.infer<typeof claimImageSchema>;

// ---------------------------------------------------------------------------
// POST /api/claims/[id]/action
// ---------------------------------------------------------------------------
export const reviewActionSchema = z.object({
  action: z.enum(REVIEW_ACTION_IDS),
  notes: z.string().optional(),
  reason: z.string().optional(),
  override_reason: z.string().optional(),
  required_angles: z.array(z.string()).optional(),
  corrected_crop: z.string().optional(),
  corrected_grade: z.string().optional(),
  corrected_severity: z.string().optional(),
  corrected_damage_codes: z.array(z.string()).optional(),
  corrected_affected_area_pct: z.number().finite().optional(),
  corrected_growth_stage: z.string().optional(),
});

export type ReviewActionBody = z.infer<typeof reviewActionSchema>;

// ---------------------------------------------------------------------------
// POST /api/farmer/plots
// ---------------------------------------------------------------------------
/** Mirrors CROPS keys in src/app/api/farmer/plots/route.ts. */
export const PLOT_CROP_KEYS = [
  "wheat",
  "paddy",
  "maize",
  "mustard",
  "potato",
  "sugarcane",
  "cotton",
  "soybean",
  "gram",
  "groundnut",
  "onion",
  "pulses",
] as const;

/** Mirrors AreaUnit in src/lib/land-units.ts. */
export const AREA_UNITS = ["kattha", "bigha", "acre", "hectare"] as const;

export const plotSchema = z.object({
  name: trimmedNonEmpty(80),
  cropType: z
    .preprocess((val) => (typeof val === "string" ? val.trim().toLowerCase() : val), z.enum(PLOT_CROP_KEYS))
    .default("wheat"),
  cropTypeHi: optionalTrimmed(80),
  nameHi: optionalTrimmed(80),
  khasraNumber: optionalTrimmed(64),
  khataNumber: optionalTrimmed(64),
  hissaNumber: optionalTrimmed(64),
  tehsil: optionalTrimmed(120),
  ownershipType: optionalTrimmed(32),
  season: optionalTrimmed(32),
  areaKattha: z.preprocess(absentToUndefined, z.coerce.number().finite().positive().optional()),
  areaHectares: z.preprocess(absentToUndefined, z.coerce.number().finite().positive().optional()),
  areaValue: z.preprocess(absentToUndefined, z.coerce.number().finite().positive().optional()),
  areaUnit: z.preprocess(absentToUndefined, z.enum(AREA_UNITS).optional()),
  lat: optionalBounded(-90, 90),
  lon: optionalBounded(-180, 180),
  sowingDate: optionalIsoDate,
  cropVariety: optionalTrimmed(120),
  soilType: optionalTrimmed(80),
  soilTypeHi: optionalTrimmed(80),
  irrigationType: optionalTrimmed(80),
  irrigationTypeHi: optionalTrimmed(80),
  village: optionalTrimmed(120),
  district: optionalTrimmed(120),
  state: optionalTrimmed(120),
});

export type PlotBody = z.infer<typeof plotSchema>;

// ---------------------------------------------------------------------------
// POST /api/farmer/plots/[id]/timeline
// ---------------------------------------------------------------------------
/** Seed accepts an empty body ({}) — kept as a passthrough object schema. */
export const plotTimelineSchema = z.object({}).passthrough();

// ---------------------------------------------------------------------------
// PATCH /api/milestones/[id]
// ---------------------------------------------------------------------------
export const milestoneSchema = z.object({
  dueDate: isoDate.optional(),
  completed: z.boolean().optional(),
  /** Stored only when the client explicitly sends it (null clears it). */
  completedDate: z.union([isoDate, z.null()]).optional(),
  evidenceImageUrl: z.string().max(2048).optional(),
  notes: z.string().max(2000).optional(),
  isOverdue: z.boolean().optional(),
});

export type MilestoneBody = z.infer<typeof milestoneSchema>;

// ---------------------------------------------------------------------------
// POST /api/saathi/tool
// ---------------------------------------------------------------------------
/** Mirrors ALLOWED_TOOLS in src/app/api/saathi/tool/route.ts. */
export const SAATHI_TOOL_NAMES = [
  "request_evidence_angles",
  "call_context_signal",
  "guide_capture",
  "classify_claim",
  "take_photo",
  "capture_current_angle",
  "switch_camera",
  "select_angle",
  "select_capture_angle",
  "retake_angle",
  "retake_capture_angle",
  "set_observation",
  "set_capture_observation",
  "submit_claim",
  "prepare_submit_claim",
  "check_evidence_quality",
  "check_plot_geofence",
  "fetch_agro_weather_alerts",
  "explain_claim_audit",
  "register_plot",
] as const;

/** Tool name enum + free-form args object; per-tool arg rules stay in sanitizeArgs. */
export const toolCallSchema = z.object({
  name: z.enum(SAATHI_TOOL_NAMES),
  args: z.object({}).passthrough().optional(),
});
