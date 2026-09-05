export type ContextSource = "imd" | "sentinel" | "bhuvan" | "wildlife" | "nearby" | "gps" | "plot_match";
export type ContextStatus = "pending" | "available" | "unavailable" | "error";

export interface ContextSignal {
  source: ContextSource;
  status: ContextStatus;
  labelEn: string;
  labelHi: string;
  summaryEn: string;
  summaryHi: string;
  confidence?: number; // 0-100
  meta?: Record<string, unknown>;
  checkedAt: string;
}

export interface AssembledContext {
  signals: ContextSignal[];
  overall: {
    status: "strong" | "mixed" | "weak" | "pending";
    summaryEn: string;
    summaryHi: string;
  };
  sentinelThumbnailUrl?: string | null;
  bhuvanThumbnailUrl?: string | null;
  sentinelTileUrl?: string | null;
  imdRainfallMm?: number | null;
  sentinelBurnRatio?: number | null;
  imdHailDays7d?: number | null;
  imdWindGustMaxKph?: number | null;
}

export function contextOverall(signals: ContextSignal[]): AssembledContext["overall"] {
  const plotMatchSignal = signals.find((s) => s.source === "plot_match");
  const plotMismatch = plotMatchSignal && plotMatchSignal.meta?.within === false;

  const available = signals.filter((s) => s.status === "available").length;
  const pending = signals.filter((s) => s.status === "pending").length;

  if (plotMismatch) {
    return {
      status: "mixed",
      summaryEn: "Location mismatch: capture point is outside registered plot boundary",
      summaryHi: "स्थान बेमेल: कैप्चर बिंदु पंजीकृत प्लॉट सीमा से बाहर है",
    };
  }

  if (pending > 0 && available === 0) return { status: "pending", summaryEn: "Context checks pending", summaryHi: "संदर्भ जाँच लंबित" };
  if (available >= 2) return { status: "strong", summaryEn: "Multi-signal context supports the claim", summaryHi: "बहु-संकेत संदर्भ दावे का समर्थन करता है" };
  if (available === 1) return { status: "mixed", summaryEn: "Partial context available — human review recommended", summaryHi: "आंशिक संदर्भ — मानव समीक्षा उचित" };
  return { status: "weak", summaryEn: "Limited external context — relies on field evidence", summaryHi: "सीमित बाहरी संदर्भ — केवल खेत साक्ष्य" };
}
