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
] as const;

// ---------------------------------------------------------------------------
// POST /api/claims
// ---------------------------------------------------------------------------
export const claimImageSchema = z.object({
  imageDataUrl: z.string(),
  angleType: z.string().optional().default("closeup_damage"),
  sha256: z.string().optional(),
  lat: boundedNumber(-90, 90).nullish(),
  lon: boundedNumber(-180, 180).nullish(),
  accuracyM: boundedNumber(0, 100000).nullish(),
  lightingScore: z.number().finite().nullish(),
  qualityPassed: z.boolean().nullish(),
  blurScore: z.number().finite().nullish(),
  greenPct: z.number().finite().nullish(),
  facing: z.string().nullish(),
  dimensions: z.object({ width: z.number().finite(), height: z.number().finite() }).nullish(),
  capturedAt: z.string().nullish(),
});

/** Body of POST /api/claims (1..6 images; data-URL/MIME/size checks stay in-route). */
export const claimSubmissionSchema = z.object({
  images: z.array(claimImageSchema).min(1).max(6),
  id: trimmedNonEmpty(128).optional(),
  plotId: z.string().optional(),
  plotName: z.string().optional(),
  plotNameHi: z.string().optional(),
  khasraNumber: z.string().optional(),
  cropType: z.string().optional(),
  cropTypeHi: z.string().optional(),
  cropVariety: z.string().optional(),
  farmerObservations: z.string().optional(),
  captureLat: boundedNumber(-90, 90).optional(),
  captureLon: boundedNumber(-180, 180).optional(),
  captureAccuracyM: boundedNumber(0, 100000).optional(),
  gpsStatus: z.string().optional(),
  peril: trimmedNonEmpty(64).optional(),
  intentId: trimmedNonEmpty(128).optional(),
  plotLat: boundedNumber(-90, 90).optional(),
  plotLon: boundedNumber(-180, 180).optional(),
  sowingDate: isoDate.optional(),
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
  cropType: z.enum(PLOT_CROP_KEYS).default("wheat"),
  cropTypeHi: z.string().max(80).optional(),
  nameHi: z.string().max(80).optional(),
  khasraNumber: z.string().max(64).optional(),
  khataNumber: z.string().max(64).optional(),
  hissaNumber: z.string().max(64).optional(),
  tehsil: z.string().max(120).optional(),
  ownershipType: z.string().max(32).optional(),
  season: z.string().max(32).optional(),
  areaKattha: z.coerce.number().finite().positive().optional(),
  areaHectares: z.coerce.number().finite().positive().optional(),
  areaValue: z.coerce.number().finite().positive().optional(),
  areaUnit: z.enum(AREA_UNITS).optional(),
  lat: z.coerce.number().finite().min(-90).max(90).optional(),
  lon: z.coerce.number().finite().min(-180).max(180).optional(),
  sowingDate: isoDate.optional(),
  cropVariety: z.string().max(120).optional(),
  soilType: z.string().max(80).optional(),
  irrigationType: z.string().max(80).optional(),
  village: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
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
  /** Route stores null explicitly when absent, so undefined stays optional. */
  completedDate: z.union([isoDate, z.null()]).optional(),
  evidenceImageUrl: z.string().optional(),
  notes: z.string().optional(),
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
  "switch_camera",
  "select_angle",
  "retake_angle",
  "set_observation",
  "submit_claim",
  "check_evidence_quality",
] as const;

/** Tool name enum + free-form args object; per-tool arg rules stay in sanitizeArgs. */
export const toolCallSchema = z.object({
  name: z.enum(SAATHI_TOOL_NAMES),
  args: z.object({}).passthrough().optional(),
});
