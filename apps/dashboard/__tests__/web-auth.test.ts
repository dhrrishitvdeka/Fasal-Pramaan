import { describe, expect, it } from "vitest";
import { canAccessReviewerPortal, reviewerLoginHref } from "../src/lib/review-access";
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

  it("never allows user metadata to elevate role to reviewer or administrator", () => {
    // resolveWebRole does not accept userRoles, only appRoles and profileRole
    expect(resolveWebRole({ appRoles: ["farmer"] })).toBe("farmer");
    expect(resolveWebRole({ email: "attacker@example.com" })).toBe("farmer");
  });

  it("treats REVIEWER_EMAILS as a reviewer allowlist", () => {
    const previous = process.env.REVIEWER_EMAILS;
    process.env.REVIEWER_EMAILS = "lead@example.com, other@example.com";
    expect(resolveWebRole({ email: "lead@example.com" })).toBe("reviewer");
    expect(resolveWebRole({ email: "farmer@example.com" })).toBe("farmer");
    process.env.REVIEWER_EMAILS = previous;
  });

  it("does not treat a farmer or empty session as reviewer portal access", () => {
    expect(canAccessReviewerPortal(null)).toBe(false);
    expect(canAccessReviewerPortal([])).toBe(false);
    expect(canAccessReviewerPortal(["farmer"])).toBe(false);
    expect(canAccessReviewerPortal(["reviewer"])).toBe(true);
    expect(canAccessReviewerPortal(["administrator"])).toBe(true);
    expect(reviewerLoginHref("/overview")).toBe("/login?next=%2Foverview");
    expect(reviewerLoginHref("/farmer")).toBe("/login?next=%2Foverview");
    expect(reviewerLoginHref("/review/abc")).toBe("/login?next=%2Freview%2Fabc");
  });
});
