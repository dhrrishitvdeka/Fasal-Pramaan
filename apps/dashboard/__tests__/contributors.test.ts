import { describe, expect, it } from "vitest";
import { CORE_CONTRIBUTORS, contributorAvatarUrl, contributorProfileUrl } from "../src/lib/contributors";

describe("core contributors", () => {
  it("lists four GitHub handles and circular avatar URLs", () => {
    expect(CORE_CONTRIBUTORS).toEqual([
      "dhrrishitvdeka",
      "parasdwivedi26",
      "vedantparashar25",
      "sandeepkumargupta1",
    ]);
    for (const github of CORE_CONTRIBUTORS) {
      expect(contributorProfileUrl(github)).toBe(`https://github.com/${github}`);
      expect(contributorAvatarUrl(github, 160)).toBe(`https://github.com/${github}.png?size=160`);
    }
  });
});
