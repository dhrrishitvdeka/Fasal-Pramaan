const LEGACY_TOKEN_KEYS = ["fp_access_token", "fp_refresh_token", "fp_demo_user"];

/**
 * One-time purge of legacy pre-Supabase token keys. Those belonged to a
 * retired external backend and must never authenticate API calls.
 */
function purgeLegacyTokenKeys(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_TOKEN_KEYS) {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable — nothing to purge
  }
}

let purged = false;

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!purged) {
    purged = true;
    purgeLegacyTokenKeys();
  }
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}
