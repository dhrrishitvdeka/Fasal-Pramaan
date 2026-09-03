export const CORE_CONTRIBUTORS = [
  "dhrrishitvdeka",
  "parasdwivedi26",
  "vedantparashar25",
  "sandeepkumargupta1",
] as const;

export type ContributorGithub = (typeof CORE_CONTRIBUTORS)[number];

export function contributorAvatarUrl(github: string, size = 160): string {
  return `https://github.com/${github}.png?size=${size}`;
}

export function contributorProfileUrl(github: string): string {
  return `https://github.com/${github}`;
}
