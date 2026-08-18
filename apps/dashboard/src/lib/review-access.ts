export function canAccessReviewerPortal(roles: string[] | null | undefined): boolean {
  if (!roles?.length) return false;
  return roles.some((role) => role === "reviewer" || role === "administrator");
}

export function reviewerLoginHref(next = "/overview"): string {
  const path =
    next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/overview";
  if (path === "/login" || path === "/unlock" || path.startsWith("/farmer")) {
    return "/login?next=%2Foverview";
  }
  return `/login?next=${encodeURIComponent(path)}`;
}
