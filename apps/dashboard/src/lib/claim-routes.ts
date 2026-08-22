export function resolveClaimClientPath(
  supabaseConfigured: boolean,
  kind: "list" | "submit" | "get" | "action",
  id = "",
): { hosted: boolean; path: string } {
  if (supabaseConfigured) {
    if (kind === "list" || kind === "submit") return { hosted: true, path: "/api/claims" };
    if (kind === "get") return { hosted: true, path: `/api/claims/${id}` };
    return { hosted: true, path: `/api/claims/${id}/action` };
  }
  if (kind === "list") return { hosted: false, path: "/review/queue" };
  if (kind === "submit") return { hosted: false, path: "/submissions" };
  if (kind === "get") return { hosted: false, path: `/review/${id}` };
  return { hosted: false, path: `/review/${id}/action` };
}
