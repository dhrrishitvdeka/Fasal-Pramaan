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

  if (cfg.needsSatellite && !sentinelOk) {
    const satReason =
      peril === "flood"
        ? "Flood claim needs satellite water-extent confirmation — keeping as medium until Sentinel is available"
        : peril === "drought"
          ? "Drought claim needs satellite vegetation-index confirmation — keeping as medium until Sentinel is available"
          : "Fire claim needs satellite burn-scar confirmation — keeping as medium until Sentinel available";
    const satReasonHi =
      peril === "flood"
        ? "बाढ़ दावे को सैटेलाइट जल-क्षेत्र पुष्टि चाहिए — मध्यम पर रखा"
        : peril === "drought"
          ? "सूखा दावे को सैटेलाइट वनस्पति पुष्टि चाहिए — मध्यम पर रखा"
          : "आग के दावे को सैटेलाइट पुष्टि चाहिए — मध्यम पर रखा";
    reasons.push(satReason);
    reasonsHi.push(satReasonHi);
    if (opts.overall >= threshold) {
      const nextStep = capturedMissing.length > 0 ? "request_missing" : "proceed";
      return { level: "medium", nextStep, threshold, overall: opts.overall, reasons, reasonsHi, missingAngles: capturedMissing };
    }
    return { level: "low", nextStep: "escalate_to_human", threshold, overall: opts.overall, reasons, reasonsHi, missingAngles: capturedMissing };
  }

  const imd = signals.find((s) => s.source === "imd");
  const rainMm = Number(imd?.meta?.rainfall_7d_mm);
  const hailDays = Number(imd?.meta?.hailDays7d);
  const gustKph = Number(imd?.meta?.windGustMaxKph);
  if (peril === "flood" && Number.isFinite(rainMm) && rainMm < 20) {
    reasons.push("Flood claim has little 7-day rainfall corroboration — officer review recommended");
    reasonsHi.push("बाढ़ दावे को 7-दिन वर्षा समर्थन कम है — अधिकारी समीक्षा उचित");
  }
  if (peril === "drought" && Number.isFinite(rainMm) && rainMm > 40) {
    reasons.push("Drought claim coincides with substantial recent rainfall — officer review recommended");
    reasonsHi.push("सूखा दावे के साथ हाल की पर्याप्त वर्षा — अधिकारी समीक्षा उचित");
  }
  if (peril === "hailstorm" && Number.isFinite(hailDays) && hailDays === 0) {
    reasons.push("No hail weather codes in the past week — keep as medium until an officer confirms impact");
    reasonsHi.push("पिछले सप्ताह ओला कोड नहीं — मध्यम पर रखें");
  }
  if (peril === "lodging" && Number.isFinite(gustKph) && gustKph < 40) {
    reasons.push("Wind gusts below lodging threshold — officer review recommended");
    reasonsHi.push("हवा झोंके गिराव सीमा से कम — अधिकारी समीक्षा उचित");
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

  const weatherConflict =
    (peril === "flood" && Number.isFinite(rainMm) && rainMm < 20) ||
    (peril === "drought" && Number.isFinite(rainMm) && rainMm > 40) ||
    (peril === "hailstorm" && Number.isFinite(hailDays) && hailDays === 0) ||
    (peril === "lodging" && Number.isFinite(gustKph) && gustKph < 40);

  if (opts.overall >= threshold && opts.coverage >= 60 && opts.quality >= 40) {
    level = weatherConflict ? "medium" : "high";
    nextStep = capturedMissing.length > 0 ? "request_missing" : "proceed";
    reasons.push(weatherConflict ? "Field photos pass, but weather/satellite context is mixed" : "Evidence meets peril threshold");
    reasonsHi.push(weatherConflict ? "फोटो पर्याप्त, मौसम/सैटेलाइट संदर्भ मिश्रित" : "साक्ष्य आपदा सीमा पर खरा");
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
