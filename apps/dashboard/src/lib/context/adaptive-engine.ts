import type { ContextSignal } from "./types";
import { routeForPeril, type Peril } from "../claim-routing";

export type AdaptiveLevel = "high" | "medium" | "low";

export interface AdaptiveResult {
  level: AdaptiveLevel;
  nextStep: "proceed" | "request_missing" | "retake" | "escalate_to_human";
  threshold: number;
  overall: number;
  reasons: string[];
  reasonsHi: string[];
  missingAngles: string[];
}

export function adaptiveConfidence(opts: {
  quality: number;
  coverage: number;
  context: number;
  integrity: number;
  overall: number;
  peril: Peril;
  signals?: ContextSignal[];
  gateFailed?: boolean;
  duplicateDetected?: boolean;
  missingAngles?: string[];
}): AdaptiveResult {
  const peril = opts.peril || "normal";
  const cfg = routeForPeril(peril);
  const threshold = cfg.minConfidence;
  let level: AdaptiveLevel = "low";
  let nextStep: AdaptiveResult["nextStep"] = "retake";
  const reasons: string[] = [];
  const reasonsHi: string[] = [];
  const signals = opts.signals || [];
  const required = new Set(cfg.requiredAngles);
  const capturedMissing = (opts.missingAngles || []).filter((a) => required.has(a));

  const hasSentinel = signals.find((s) => s.source === "sentinel");
  const sentinelOk = hasSentinel?.status === "available";
  const gps = signals.find((s) => s.source === "gps");
  const gateBlock = opts.gateFailed;

  if (opts.duplicateDetected) {
    reasons.push("Exact same angle or duplicate image uploaded — retake required");
    reasonsHi.push("एक ही कोण या डुप्लिकेट फोटो अपलोड की गई — पुनः फोटो आवश्यक");
    return { level: "low", nextStep: "retake", threshold, overall: opts.overall, reasons, reasonsHi, missingAngles: capturedMissing };
  }

  if (gateBlock) {
    reasons.push("Authenticity gate flagged image as unusable");
    reasonsHi.push("प्रामाणिकता जाँच में फोटो अयोग्य पाई गई");
    return { level: "low", nextStep: "retake", threshold, overall: opts.overall, reasons, reasonsHi, missingAngles: capturedMissing };
  }
  if (opts.integrity < 50) {
    reasons.push("Integrity check failed — possible duplicate or tamper");
    reasonsHi.push("अखंडता जाँच विफल — डुप्लिकेट या छेड़छाड़ संभव");
    return { level: "low", nextStep: "escalate_to_human", threshold, overall: opts.overall, reasons, reasonsHi, missingAngles: [] };
  }

  // fire_burn needs satellite or at least weak threshold
  if (peril === "fire_burn" && !sentinelOk) {
    reasons.push("Fire claim needs satellite burn-scar confirmation — keeping as medium until Sentinel available");
    reasonsHi.push("आग के दावे को सैटेलाइट पुष्टि चाहिए — मध्यम पर रखा");
    if (opts.overall >= threshold) {
      const nextStep = capturedMissing.length > 0 ? "request_missing" : "proceed";
      return { level: "medium", nextStep, threshold, overall: opts.overall, reasons, reasonsHi, missingAngles: capturedMissing };
    }
    return { level: "low", nextStep: "escalate_to_human", threshold, overall: opts.overall, reasons, reasonsHi, missingAngles: capturedMissing };
  }

  if (peril === "animal_damage" && gps?.status !== "available") {
    reasons.push("Animal damage benefits from GPS trail — request location");
    reasonsHi.push("जानवर क्षति के लिए जीपीएस ट्रेल सहायक — स्थान माँगें");
    if (opts.overall >= 70) {
      // B2: never route to request_missing with zero missing angles — proceed instead.
      const nextStep = capturedMissing.length > 0 ? "request_missing" : "proceed";
      return { level: "medium", nextStep, threshold, overall: opts.overall, reasons, reasonsHi, missingAngles: capturedMissing };
    }
  }

  if (opts.overall >= threshold && opts.coverage >= 60 && opts.quality >= 40) {
    level = "high";
    nextStep = "proceed";
    reasons.push("Evidence meets peril threshold");
    reasonsHi.push("साक्ष्य आपदा सीमा पर खरा");
  } else if (opts.overall >= threshold - 20 && opts.coverage >= 40) {
    level = "medium";
    // B2: never request_missing with zero missing angles — there is nothing to ask for.
    nextStep = capturedMissing.length > 0 ? "request_missing" : "proceed";
    if (capturedMissing.length > 0) {
      reasons.push(`Missing required angles: ${capturedMissing.join(", ")}`);
      reasonsHi.push(`आवश्यक कोण अनुपलब्ध: ${capturedMissing.join(", ")}`);
    } else if (opts.coverage < 80) {
      reasons.push("Missing angles — request specific views");
      reasonsHi.push("कुछ कोणों की कमी — विशिष्ट दृश्य माँगें");
    }
    if (opts.quality < 50) {
      reasons.push("Quality low — request retake of blurry frame");
      reasonsHi.push("गुणवत्ता कम — धुंधले फ्रेम की पुनः फोटो माँगें");
    }
  } else {
    level = "low";
    // if coverage low but integrity ok → retake; else escalate
    if (opts.coverage < 40 || opts.quality < 30) nextStep = "retake";
    else nextStep = "escalate_to_human";
    reasons.push("Overall confidence below adaptive threshold");
    reasonsHi.push("कुल विश्वास अनुकूल सीमा से कम");
  }

  return { level, nextStep, threshold, overall: opts.overall, reasons, reasonsHi, missingAngles: capturedMissing };
}
