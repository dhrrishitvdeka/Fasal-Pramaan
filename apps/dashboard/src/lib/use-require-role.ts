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
 * guarded pages within the same SPA session.
 */
let cachedRoles: string[] | undefined;
let inflight: Promise<string[] | null> | null = null;

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

  const [result, setResult] = useState<RequireRoleResult>(() =>
    cachedRoles === undefined
      ? { status: "loading", roles: null }
      : { status: deriveStatus(cachedRoles, allowedKey), roles: cachedRoles },
  );

  useEffect(() => {
    if (cachedRoles !== undefined) {
      setResult({ status: deriveStatus(cachedRoles, allowedKey), roles: cachedRoles });
      return;
    }
    let cancelled = false;
    void fetchSessionRoles().then((roles) => {
      if (roles) cachedRoles = roles;
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
