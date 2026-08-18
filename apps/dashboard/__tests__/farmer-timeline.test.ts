import { describe, expect, it } from "vitest";
import {
  dueDateFromSowing,
  groupMilestonesByPlot,
  isMilestoneOverdue,
  milestoneCaptureHref,
  milestoneDueState,
  nextOpenMilestone,
  parseFarmerAlertPrefs,
  pickDefaultPlotId,
} from "../src/lib/farmer-timeline";
import type { FarmerPlot, GrowthTimelineMilestone } from "../src/lib/farmerStore";

function plot(id: string, name = id): FarmerPlot {
  return {
    id,
    name,
    nameHi: name,
    khasraNumber: "1",
    areaHectares: 1,
    cropType: "Wheat",
    cropTypeHi: "गेहूँ",
    cropVariety: "",
    currentStage: "",
    currentStageHi: "",
    sowingDate: "2026-06-01",
    soilType: "",
    soilTypeHi: "",
    irrigationType: "",
    irrigationTypeHi: "",
    lat: 0,
    lon: 0,
    village: "",
    district: "",
    state: "",
  };
}

function milestone(partial: Partial<GrowthTimelineMilestone> & { id: string }): GrowthTimelineMilestone {
  return {
    plotId: "p1",
    cropName: "Wheat",
    cropNameHi: "गेहूँ",
    stageName: "Tillering",
    stageNameHi: "कल्ले",
    dayNumber: 30,
    dueDate: "2026-07-01",
    completed: false,
    isOverdue: false,
    ...partial,
  };
}

describe("farmer timeline", () => {
  it("groups stages by plot and keeps orphans", () => {
    const sections = groupMilestonesByPlot(
      [plot("p1", "North"), plot("p2", "South")],
      [
        milestone({ id: "m1", plotId: "p1", dayNumber: 60 }),
        milestone({ id: "m2", plotId: "p1", dayNumber: 30 }),
        milestone({ id: "m3", plotId: "gone" }),
      ],
    );
    expect(sections.map((item) => item.plotId)).toEqual(["p1", "p2", "gone"]);
    expect(sections[0].milestones.map((item) => item.id)).toEqual(["m2", "m1"]);
    expect(sections[1].milestones).toEqual([]);
    expect(sections[2].plot).toBeNull();
  });

  it("marks overdue from due date and picks the next open stage", () => {
    const open = milestone({ id: "late", dueDate: "2026-07-01", dayNumber: 30 });
    const later = milestone({ id: "later", dueDate: "2026-09-01", dayNumber: 90 });
    expect(isMilestoneOverdue(open, "2026-08-01")).toBe(true);
    expect(isMilestoneOverdue({ ...open, completed: true }, "2026-08-01")).toBe(false);
    expect(nextOpenMilestone([later, open], "2026-08-01")?.id).toBe("late");
    expect(milestoneDueState(open, "late", "2026-08-01")).toBe("overdue");
    expect(milestoneDueState(later, "late", "2026-08-01")).toBe("upcoming");
  });

  it("builds a capture URL that closes the milestone loop", () => {
    expect(milestoneCaptureHref(milestone({ id: "ms-9", plotId: "plot-a", cropName: "Paddy" }))).toBe(
      "/farmer/capture?milestone=ms-9&plotId=plot-a&crop=Paddy",
    );
  });

  it("prefers a plot that is overdue when choosing the default tab", () => {
    const sections = groupMilestonesByPlot(
      [plot("ok"), plot("late")],
      [
        milestone({ id: "a", plotId: "ok", dueDate: "2026-09-01" }),
        milestone({ id: "b", plotId: "late", dueDate: "2026-06-01" }),
      ],
    );
    expect(pickDefaultPlotId(sections, "2026-08-01")).toBe("late");
  });

  it("offsets stage due dates from sowing and rejects invalid alert payloads", () => {
    expect(dueDateFromSowing("2026-06-01", 30)).toBe("2026-07-01");
    expect(parseFarmerAlertPrefs({ sms: false, whatsapp: true })).toEqual({ sms: false, whatsapp: true });
    expect(parseFarmerAlertPrefs("nope")).toEqual({ sms: true, whatsapp: true });
  });
});
