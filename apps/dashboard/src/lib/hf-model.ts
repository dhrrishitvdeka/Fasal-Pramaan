import { FASAL_SPACE_ID, resolveHfModelId, resolveHfSpaceUrl } from "./hf-infer";

// Lazy accessors — env may change after boot (tests, edge re-eval), so never
// snapshot process.env at module load.
export function getHfModelId(): string {
  return resolveHfModelId();
}

export function getHfSpaceId(): string {
  return process.env.NEXT_PUBLIC_HF_SPACE_ID || FASAL_SPACE_ID;
}

export function getHfSpaceUrl(): string {
  return resolveHfSpaceUrl();
}

