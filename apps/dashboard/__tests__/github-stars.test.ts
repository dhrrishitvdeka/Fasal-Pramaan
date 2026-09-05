import { describe, expect, it } from "vitest";
import { CANONICAL_GITHUB_REPO, resolveGithubRepo } from "../src/lib/github-repo";

describe("GitHub Stars formatting and validation", () => {
  it("rewrites the zip-folder repo name to the real GitHub repo", () => {
    expect(resolveGithubRepo(undefined)).toBe(CANONICAL_GITHUB_REPO);
    expect(resolveGithubRepo("dhrrishitvdeka/Fasal-Pramaan")).toBe(CANONICAL_GITHUB_REPO);
    expect(resolveGithubRepo("dhrrishitvdeka/Fasal-Pramaan-main")).toBe(CANONICAL_GITHUB_REPO);
    expect(resolveGithubRepo("Fasal-Pramaan-main")).toBe(CANONICAL_GITHUB_REPO);
  });

  it("validates repository format correctly", () => {
    const validRepoRegex = /^[\w.-]+\/[\w.-]+$/;
    expect(validRepoRegex.test("dhrrishitvdeka/Fasal-Pramaan")).toBe(true);
    expect(validRepoRegex.test("octocat/Hello-World")).toBe(true);
    expect(validRepoRegex.test("invalid-repo")).toBe(false);
    expect(validRepoRegex.test("bad/repo/name")).toBe(false);
  });

  it("formats counts accurately for display", () => {
    const formatCount = (count: number) => {
      if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
      if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
      return count.toString();
    };

    expect(formatCount(7)).toBe("7");
    expect(formatCount(950)).toBe("950");
    expect(formatCount(1200)).toBe("1.2k");
    expect(formatCount(2500000)).toBe("2.5M");
  });
});
