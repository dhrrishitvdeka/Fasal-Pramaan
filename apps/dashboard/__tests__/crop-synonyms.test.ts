import { describe, it, expect } from "vitest";
import { isCropMatch, isCropMismatch, normalizeCropName } from "../src/lib/crop-synonyms";

describe("crop-synonyms", () => {
  it("normalizes crop strings removing noise words and punctuation", () => {
    expect(normalizeCropName("Paddy Crop")).toBe("paddy");
    expect(normalizeCropName("Wheat (Gehun) Field")).toBe("wheat gehun");
    expect(normalizeCropName("Asian Rice Plants")).toBe("asian rice");
  });

  it("matches identical crops regardless of case and spacing", () => {
    expect(isCropMatch("Wheat", "wheat")).toBe(true);
    expect(isCropMatch("  paddy  ", "PADDY")).toBe(true);
    expect(isCropMatch("Maize", "Maize Crop")).toBe(true);
  });

  it("matches paddy and rice synonyms", () => {
    expect(isCropMatch("paddy", "rice")).toBe(true);
    expect(isCropMatch("rice", "paddy")).toBe(true);
    expect(isCropMatch("paddy", "dhan")).toBe(true);
    expect(isCropMatch("paddy", "oryza sativa")).toBe(true);
    expect(isCropMatch("paddy / rice", "rice")).toBe(true);
    expect(isCropMatch("Paddy", "Asian Rice Crop")).toBe(true);
  });

  it("matches maize and corn synonyms", () => {
    expect(isCropMatch("maize", "corn")).toBe(true);
    expect(isCropMatch("corn", "maize")).toBe(true);
    expect(isCropMatch("maize", "makka")).toBe(true);
    expect(isCropMatch("maize", "sweet corn")).toBe(true);
  });

  it("matches gram and chickpea synonyms", () => {
    expect(isCropMatch("gram", "chickpea")).toBe(true);
    expect(isCropMatch("chana", "gram")).toBe(true);
    expect(isCropMatch("chickpea", "bengal gram")).toBe(true);
    expect(isCropMatch("Gram (Chickpea)", "chana")).toBe(true);
  });

  it("matches wheat and gehun synonyms", () => {
    expect(isCropMatch("wheat", "gehun")).toBe(true);
    expect(isCropMatch("gehu", "wheat")).toBe(true);
  });

  it("matches mustard and sarson/rapeseed synonyms", () => {
    expect(isCropMatch("mustard", "sarson")).toBe(true);
    expect(isCropMatch("mustard", "rapeseed")).toBe(true);
    expect(isCropMatch("mustard", "raya")).toBe(true);
  });

  it("matches cotton and kapas synonyms", () => {
    expect(isCropMatch("cotton", "kapas")).toBe(true);
  });

  it("matches potato and aloo synonyms", () => {
    expect(isCropMatch("potato", "aloo")).toBe(true);
  });

  it("matches groundnut and peanut synonyms", () => {
    expect(isCropMatch("groundnut", "peanut")).toBe(true);
    expect(isCropMatch("groundnut", "moongphali")).toBe(true);
  });

  it("handles unknown or empty values as matching (fail open)", () => {
    expect(isCropMatch("wheat", "unknown")).toBe(true);
    expect(isCropMatch("unknown", "wheat")).toBe(true);
    expect(isCropMatch(null, "wheat")).toBe(true);
    expect(isCropMatch("wheat", undefined)).toBe(true);
  });

  it("identifies genuine mismatches correctly", () => {
    expect(isCropMatch("wheat", "paddy")).toBe(false);
    expect(isCropMatch("cotton", "sugarcane")).toBe(false);
    expect(isCropMatch("maize", "potato")).toBe(false);
    expect(isCropMatch("black gram", "green gram")).toBe(false);
    expect(isCropMatch("chickpea", "pigeon pea")).toBe(false);
    expect(isCropMatch("pearl millet", "pea")).toBe(false);
    expect(isCropMismatch("wheat", "paddy")).toBe(true);
    expect(isCropMismatch("paddy", "rice")).toBe(false);
    expect(isCropMismatch("black gram", "green gram")).toBe(true);
  });

  it("matches generic pulses category with specific pulse crops", () => {
    expect(isCropMatch("pulses", "chickpea")).toBe(true);
    expect(isCropMatch("dal", "black gram")).toBe(true);
    expect(isCropMatch("moong", "pulses")).toBe(true);
  });
});

