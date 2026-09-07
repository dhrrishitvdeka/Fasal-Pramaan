"use client";

import { useEffect, useState } from "react";
import { currentSessionRoles } from "@/lib/api";

export type RoleGateStatus = "loading" | "ok" | "denied" | "unauthenticated";

export type RequireRoleResult = {
  status: RoleGateStatus;
  roles: string[] | null;
};

/**
 * Module-level cache so client-side navigations do not refetch roles.
 * Only positive (authenticated) results are cached — a null result is
 * re-checked on every mount so signing in on /login immediately unblocks
 * guarded pages within the same SPA session. Entries expire after
 * ROLE_CACHE_TTL_MS so a mid-session demotion can't linger indefinitely.
 */
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedRoles: string[] | undefined;
let cachedAt = 0;
let inflight: Promise<string[] | null> | null = null;

export function clearRoleCache(): void {
  cachedRoles = undefined;
  cachedAt = 0;
  inflight = null;
}

function readCache(): string[] | undefined {
  if (cachedRoles === undefined) return undefined;
  if (Date.now() - cachedAt > ROLE_CACHE_TTL_MS) {
    cachedRoles = undefined;
    cachedAt = 0;
    return undefined;
  }
  return cachedRoles;
}

function writeCache(roles: string[]): void {
  cachedRoles = roles;
  cachedAt = Date.now();
}

function fetchSessionRoles(): Promise<string[] | null> {
  inflight ??= currentSessionRoles()
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function deriveStatus(roles: string[] | null, allowed: string): RoleGateStatus {
  if (!roles) return "unauthenticated";
  const allowedList = allowed.split("|");
  return allowedList.some((role) => roles.includes(role)) ? "ok" : "denied";
}

export function useRequireRole(allowed: string[]): RequireRoleResult {
  // String key keeps the effect stable across renders even though callers
  // pass inline array literals.
  const allowedKey = allowed.join("|");

  const [result, setResult] = useState<RequireRoleResult>(() => {
    const cached = readCache();
    return cached === undefined
      ? { status: "loading", roles: null }
      : { status: deriveStatus(cached, allowedKey), roles: cached };
  });

  useEffect(() => {
    const cached = readCache();
    if (cached !== undefined) {
      setResult({ status: deriveStatus(cached, allowedKey), roles: cached });
      return;
    }
    let cancelled = false;
    void fetchSessionRoles().then((roles) => {
      if (roles) writeCache(roles);
      if (!cancelled) {
        setResult({ status: deriveStatus(roles, allowedKey), roles });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [allowedKey]);

  return result;
}
