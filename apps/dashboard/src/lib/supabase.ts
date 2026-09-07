import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
}

export function supabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

/**
 * Browser client for cookie-backed sessions. After httpOnly login, JS cannot
 * read the access token — API calls rely on same-origin cookies instead.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;
  if (typeof window === "undefined") {
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  if (!browserClient) {
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}

/**
 * Privileged server client. Never falls back to the anon key: an open RLS
 * policy plus anon-as-service-role is a full data leak.
 */
export function createServerSupabase(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
