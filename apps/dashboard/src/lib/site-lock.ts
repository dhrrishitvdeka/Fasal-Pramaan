export const SITE_LOCK_COOKIE = "fp_site_gate";
const GATE_PAYLOAD = "fasal-pramaan-site-lock-v1";

export function siteLockPassword(): string {
  return (process.env.SITE_LOCK_PASSWORD || "").trim();
}

/** Lock when a password is set; otherwise allow direct access. */
export function isSiteLockActive(): boolean {
  return Boolean(siteLockPassword());
}

export async function siteLockToken(password = siteLockPassword()): Promise<string> {
  if (!password) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(GATE_PAYLOAD),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidSiteLockToken(value: string | undefined): Promise<boolean> {
  const expected = await siteLockToken();
  if (!expected || !value) return false;
  const enc = new TextEncoder();
  const [hashExpected, hashValue] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
    crypto.subtle.digest("SHA-256", enc.encode(value)),
  ]);
  const u8Expected = new Uint8Array(hashExpected);
  const u8Value = new Uint8Array(hashValue);
  let mismatch = 0;
  for (let i = 0; i < u8Expected.length; i += 1) {
    mismatch |= u8Expected[i] ^ u8Value[i];
  }
  return mismatch === 0;
}
