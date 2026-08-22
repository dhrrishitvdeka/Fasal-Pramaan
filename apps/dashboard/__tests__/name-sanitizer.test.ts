import { describe, expect, it } from "vitest";
import { sanitizeMojibake, getFarmerNavLabel } from "../src/lib/name-sanitizer";

describe("name-sanitizer and nav label", () => {
  it("decodes double-encoded UTF-8 mojibake back to Hindi", () => {
    // "à¤•à¤¿à¤¸à¤¾à¤¨" -> "किसान"
    const mojibake = "à¤•à¤¿à¤¸à¤¾à¤¨";
    const cleaned = sanitizeMojibake(mojibake);
    expect(cleaned).toBe("किसान");
  });

  it("handles null, undefined, or empty strings with fallback", () => {
    expect(sanitizeMojibake(null, "Farmer")).toBe("Farmer");
    expect(sanitizeMojibake(undefined, "Farmer")).toBe("Farmer");
    expect(sanitizeMojibake("", "Farmer")).toBe("Farmer");
  });

  it("preserves clean English and Hindi names", () => {
    expect(sanitizeMojibake("Ramesh Kumar")).toBe("Ramesh Kumar");
    expect(sanitizeMojibake("रमेश कुमार")).toBe("रमेश कुमार");
    expect(sanitizeMojibake("test@gmail.com")).toBe("test@gmail.com");
  });

  it("generates correct navbar label for generic farmer in English and Hindi", () => {
    expect(getFarmerNavLabel({ name: "Farmer" }, "en")).toEqual({
      name: "Farmer",
      initial: "F",
    });
    expect(getFarmerNavLabel({ name: "Farmer" }, "hi")).toEqual({
      name: "किसान",
      initial: "क",
    });
    expect(getFarmerNavLabel({ name: "à¤•à¤¿à¤¸à¤¾à¤¨", nameHi: "à¤•à¤¿à¤¸à¤¾à¤¨" }, "hi")).toEqual({
      name: "किसान",
      initial: "क",
    });
  });

  it("generates correct navbar label for email login", () => {
    expect(getFarmerNavLabel({ name: "farmer123@gmail.com" }, "hi")).toEqual({
      name: "farmer123@gmail.com",
      initial: "F",
    });
  });

  it("generates correct navbar label for custom user name", () => {
    expect(getFarmerNavLabel({ name: "Ramesh Singh", nameHi: "रमेश सिंह" }, "hi")).toEqual({
      name: "रमेश सिंह",
      initial: "र",
    });
    expect(getFarmerNavLabel({ name: "Ramesh Singh", nameHi: "रमेश सिंह" }, "en")).toEqual({
      name: "Ramesh Singh",
      initial: "R",
    });
  });
});