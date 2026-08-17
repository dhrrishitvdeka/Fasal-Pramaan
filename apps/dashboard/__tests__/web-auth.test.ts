import { describe, expect, it } from "vitest";
import { isReviewerRole, resolveWebRole } from "../src/lib/web-auth";

describe("hosted web roles", () => {
  it("never defaults an empty identity to reviewer", () => {
    expect(resolveWebRole({})).toBe("farmer");
    expect(resolveWebRole({ email: "farmer@example.com" })).toBe("farmer");
  });

  it("honours app metadata and profile role", () => {
    expect(resolveWebRole({ appRoles: ["reviewer"] })).toBe("reviewer");
    expect(resolveWebRole({ profileRole: "administrator" })).toBe("administrator");
    expect(isReviewerRole("reviewer")).toBe(true);
    expect(isReviewerRole("farmer")).toBe(false);
  });

  it("treats REVIEWER_EMAILS as a reviewer allowlist", () => {
    const previous = process.env.REVIEWER_EMAILS;
    process.env.REVIEWER_EMAILS = "lead@example.com, other@example.com";
    expect(resolveWebRole({ email: "lead@example.com" })).toBe("reviewer");
    expect(resolveWebRole({ email: "farmer@example.com" })).toBe("farmer");
    process.env.REVIEWER_EMAILS = previous;
  });
});
