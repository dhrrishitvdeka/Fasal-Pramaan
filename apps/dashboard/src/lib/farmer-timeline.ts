import type { FarmerPlot, GrowthTimelineMilestone } from "./farmerStore";

export const DEFAULT_GROWTH_STAGES = [
  { dayNumber: 0, stageName: "Sowing", stageNameHi: "बुवाई" },
  { dayNumber: 30, stageName: "Tillering", stageNameHi: "कल्ले फूटना" },
  { dayNumber: 60, stageName: "Mid growth", stageNameHi: "मध्य अवस्था" },
  { dayNumber: 90, stageName: "Flowering", stageNameHi: "फूल आना" },
  { dayNumber: 120, stageName: "Harvest", stageNameHi: "कटाई" },
] as const;

export type TimelineDueState = "completed" | "overdue" | "next" | "upcoming";

export type TimelineSection = {
  plot: FarmerPlot | null;
  plotId: string;
  milestones: GrowthTimelineMilestone[];
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function todayIsoDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function isMilestoneOverdue(
  milestone: Pick<GrowthTimelineMilestone, "completed" | "dueDate" | "isOverdue">,
  today: string = todayIsoDate(),
): boolean {
  if (milestone.completed) return false;
  if (milestone.dueDate && milestone.dueDate < today) return true;
  return Boolean(milestone.isOverdue);
}

export function sortMilestones(milestones: GrowthTimelineMilestone[]): GrowthTimelineMilestone[] {
  return [...milestones].sort((a, b) => {
    if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
    return (a.dueDate || "").localeCompare(b.dueDate || "");
  });
}

export function nextOpenMilestone(
  milestones: GrowthTimelineMilestone[],
  today: string = todayIsoDate(),
): GrowthTimelineMilestone | undefined {
  const open = sortMilestones(milestones).filter((item) => !item.completed);
  return (
    open.find((item) => isMilestoneOverdue(item, today)) ||
    open.find((item) => item.dueDate && item.dueDate <= today) ||
    open[0]
  );
}

export function milestoneDueState(
  milestone: GrowthTimelineMilestone,
  nextId: string | undefined,
  today: string = todayIsoDate(),
): TimelineDueState {
  if (milestone.completed) return "completed";
  if (isMilestoneOverdue(milestone, today)) return "overdue";
  if (nextId && milestone.id === nextId) return "next";
  return "upcoming";
}

export function milestoneCaptureHref(milestone: GrowthTimelineMilestone): string {
  const params = new URLSearchParams({ milestone: milestone.id });
  if (milestone.plotId) params.set("plotId", milestone.plotId);
  if (milestone.cropName) params.set("crop", milestone.cropName);
  return `/farmer/capture?${params.toString()}`;
}

export function dueDateFromSowing(sowingDate: string | undefined, dayNumber: number, today: string = todayIsoDate()): string {
  const base =
    sowingDate && !Number.isNaN(Date.parse(sowingDate))
      ? new Date(`${sowingDate}T00:00:00`)
      : new Date(`${today}T00:00:00`);
  base.setDate(base.getDate() + dayNumber);
  return todayIsoDate(base);
}

export function groupMilestonesByPlot(
  plots: FarmerPlot[],
  milestones: GrowthTimelineMilestone[],
): TimelineSection[] {
  const buckets = new Map<string, GrowthTimelineMilestone[]>();
  for (const plot of plots) buckets.set(plot.id, []);
  const orphans: GrowthTimelineMilestone[] = [];
  for (const item of milestones) {
    if (item.plotId && buckets.has(item.plotId)) {
      buckets.get(item.plotId)!.push(item);
    } else {
      orphans.push(item);
    }
  }
  const sections: TimelineSection[] = plots.map((plot) => ({
    plot,
    plotId: plot.id,
    milestones: sortMilestones(buckets.get(plot.id) || []),
  }));
  if (orphans.length) {
    const byMissing = new Map<string, GrowthTimelineMilestone[]>();
    for (const item of orphans) {
      const key = item.plotId || "__unassigned";
      const list = byMissing.get(key) || [];
      list.push(item);
      byMissing.set(key, list);
    }
    for (const [plotId, items] of byMissing) {
      sections.push({ plot: null, plotId, milestones: sortMilestones(items) });
    }
  }
  return sections;
}

export function pickDefaultPlotId(sections: TimelineSection[], today: string = todayIsoDate()): string {
  const overdue = sections.find((section) =>
    section.milestones.some((item) => isMilestoneOverdue(item, today)),
  );
  if (overdue) return overdue.plotId;
  const nextOpen = sections.find((section) => section.milestones.some((item) => !item.completed));
  return (nextOpen || sections[0])?.plotId || "";
}

export type FarmerAlertPrefs = { sms: boolean; whatsapp: boolean };

export const FARMER_ALERT_PREFS_KEY = "fp_farmer_alert_prefs_v1";

export function parseFarmerAlertPrefs(raw: unknown): FarmerAlertPrefs {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    sms: value.sms !== false,
    whatsapp: value.whatsapp !== false,
  };
}
