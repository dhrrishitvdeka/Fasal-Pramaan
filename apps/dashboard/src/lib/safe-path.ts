/**
 * Same-origin path used for post-login / unlock / OAuth `next` redirects.
 * Rejects protocol-relative URLs, backslashes, and embedded hosts.
 */
export function safeInternalPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.startsWith("/\\")) {
    return fallback;
  }
  if (decoded.includes("\\") || decoded.includes("://") || /[\r\n\t@]/.test(decoded)) {
    return fallback;
  }
  const pathOnly = decoded.split(/[?#]/, 1)[0] || "";
  if (!/^\/[A-Za-z0-9/_-]*$/.test(pathOnly)) {
    return fallback;
  }
  return decoded;
}
