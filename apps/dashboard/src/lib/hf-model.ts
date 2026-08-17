import { FASAL_MODEL_REPO, FASAL_SPACE_ID, resolveHfModelId, resolveHfSpaceUrl } from "./hf-infer";

export const HF_MODEL_ID = resolveHfModelId();

export function getHfModelId(): string {
  return resolveHfModelId();
}

export function getHfSpaceId(): string {
  return process.env.NEXT_PUBLIC_HF_SPACE_ID || FASAL_SPACE_ID;
}

export function getHfSpaceUrl(): string {
  return resolveHfSpaceUrl();
}

export { FASAL_MODEL_REPO, FASAL_SPACE_ID };
