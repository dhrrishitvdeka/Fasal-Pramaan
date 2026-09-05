/** Canonical public repo. Zip folders were named Fasal-Pramaan-main. */
export const CANONICAL_GITHUB_REPO = "dhrrishitvdeka/Fasal-Pramaan";

export function resolveGithubRepo(raw?: string | null): string {
  const value = String(raw || "").trim();
  if (!value) return CANONICAL_GITHUB_REPO;
  if (/\/Fasal-Pramaan-main$/i.test(value) || /^Fasal-Pramaan-main$/i.test(value)) {
    return CANONICAL_GITHUB_REPO;
  }
  return value;
}
