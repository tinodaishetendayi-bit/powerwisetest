import { describe, expect, it } from "vitest";
import { generateToken } from "../../src/services/token.js";

describe("generateToken", () => {
  it("is exactly 20 numeric digits and never starts with 0", () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateToken()).toMatch(/^[1-9][0-9]{19}$/);
    }
  });

  it("does not repeat across many generations", () => {
    const tokens = new Set(Array.from({ length: 10_000 }, generateToken));
    expect(tokens.size).toBe(10_000);
  });
});
