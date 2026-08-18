import { DEFAULT_GROWTH_STAGES, dueDateFromSowing } from "./farmer-timeline";

export function buildDefaultMilestones(input: {
  plotId: string;
  cropName: string;
  cropNameHi: string;
  sowingDate?: string;
  createdBy: string;
  today?: string;
}) {
  return DEFAULT_GROWTH_STAGES.map((stage) => ({
    id: `ms_${input.plotId}_${stage.dayNumber}`,
    plot_id: input.plotId,
    crop_name: input.cropName,
    crop_name_hi: input.cropNameHi,
    stage_name: stage.stageName,
    stage_name_hi: stage.stageNameHi,
    day_number: stage.dayNumber,
    due_date: dueDateFromSowing(input.sowingDate, stage.dayNumber, input.today),
    completed: false,
    completed_date: null,
    evidence_image_url: null,
    notes: "",
    is_overdue: false,
    created_by: input.createdBy,
  }));
}
