export type ClaimClientKind = "list" | "submit" | "get" | "action";

/** Same-origin Next.js claim routes only. */
export function resolveClaimClientPath(
  _supabaseConfigured: boolean,
  kind: ClaimClientKind,
  id = "",
): { hosted: true; path: string } {
  if (kind === "list" || kind === "submit") return { hosted: true, path: "/api/claims" };
  if (kind === "get") return { hosted: true, path: `/api/claims/${id}` };
  return { hosted: true, path: `/api/claims/${id}/action` };
}
