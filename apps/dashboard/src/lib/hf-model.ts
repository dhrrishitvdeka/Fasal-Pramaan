/** Hugging Face Space removed — Gemini vision is the only hosted model. */
import { resolveGeminiVisionModel } from "./gemini-models";

export function getHfModelId(): string {
  return resolveGeminiVisionModel();
}

export function getHfSpaceId(): string {
  return "";
}

export function getHfSpaceUrl(): string {
  return "";
}
