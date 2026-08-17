import { describe, expect, it } from "vitest";
import { siteLockToken } from "../src/lib/site-lock";

describe("site lock token", () => {
  it("is stable for the same password and differs across passwords", async () => {
    const first = await siteLockToken("alpha-lock");
    const second = await siteLockToken("alpha-lock");
    const other = await siteLockToken("beta-lock");
    expect(first).toHaveLength(64);
    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });
});
