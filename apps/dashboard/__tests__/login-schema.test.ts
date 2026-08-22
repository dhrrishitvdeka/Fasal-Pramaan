import { describe, expect, it } from "vitest";
import { loginSchema } from "../src/lib/schemas";

describe("login form schema", () => {
  it("accepts valid credentials", () => {
    const r = loginSchema.safeParse({
      email: "reviewer@fasalpramaan.local",
      password: "Demo@12345",
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const r = loginSchema.safeParse({ email: "not-an-email", password: "Demo@12345" });
    expect(r.success).toBe(false);
  });
});
