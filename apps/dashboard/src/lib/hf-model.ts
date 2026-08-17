import { DEFAULT_HF_MODEL_ID, resolveHfModelId } from "./hf-infer";

export const HF_MODEL_ID = resolveHfModelId();

export function getHfModelId(): string {
  return resolveHfModelId() || DEFAULT_HF_MODEL_ID;
}
