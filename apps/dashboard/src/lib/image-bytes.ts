const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50];

export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp";

/** Detect JPEG / PNG / WebP from magic bytes. Ignores the client-declared MIME. */
export function sniffImageMime(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length >= 3 && JPEG.every((b, i) => bytes[i] === b)) return "image/jpeg";
  if (bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    WEBP_RIFF.every((b, i) => bytes[i] === b) &&
    WEBP_WEBP.every((b, i) => bytes[8 + i] === b)
  ) {
    return "image/webp";
  }
  return null;
}
