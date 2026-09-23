import { describe, expect, it } from "vitest";
import { calculateCentiKwh } from "../../src/services/pricing.js";

// Results are centi-kWh: 5000 = 50.00 kWh.
const kwh = (value: number) => Math.round(value * 100);

describe("calculateCentiKwh", () => {
  it("P5.00 on a fresh month buys exactly block 1 (50 kWh)", () => {
    expect(calculateCentiKwh(500, 0)).toBe(kwh(50));
  });

  it("stays inside block 1", () => {
    expect(calculateCentiKwh(300, kwh(10))).toBe(kwh(30));
  });

  it("crosses from block 1 into block 2 (challenge example: 40 kWh bought, P23.50)", () => {
    // 10 kWh x 10t = 100t, remaining 2250t / 15t = 150 kWh
    expect(calculateCentiKwh(2350, kwh(40))).toBe(kwh(160));
  });

  it("stays inside block 2", () => {
    expect(calculateCentiKwh(1500, kwh(60))).toBe(kwh(100));
  });

  it("crosses from block 2 into block 3", () => {
    // 10 kWh x 15t = 150t, remaining 850t / 20t = 42.5 kWh
    expect(calculateCentiKwh(1000, kwh(190))).toBe(kwh(52.5));
  });

  it("stays inside block 3", () => {
    expect(calculateCentiKwh(1000, kwh(250))).toBe(kwh(50));
  });

  it("starts at exactly 50 kWh at the block 2 price", () => {
    expect(calculateCentiKwh(1500, kwh(50))).toBe(kwh(100));
  });

  it("starts at exactly 200 kWh at the block 3 price", () => {
    expect(calculateCentiKwh(500, kwh(200))).toBe(kwh(25));
  });

  it("spans all three blocks in one purchase", () => {
    // 50 kWh = 500t, 150 kWh = 2250t, remaining 250t / 20t = 12.5 kWh
    expect(calculateCentiKwh(3000, 0)).toBe(kwh(212.5));
  });

  describe("rounding", () => {
    it("rounds down to 2 decimal places (33.333... -> 33.33)", () => {
      expect(calculateCentiKwh(500, kwh(60))).toBe(3333);
    });

    it("never rounds up (66.666... -> 66.66, not 66.67)", () => {
      expect(calculateCentiKwh(1000, kwh(60))).toBe(6666);
    });

    it("handles a month total that is not a whole number of kWh", () => {
      // 9.99 kWh left in block 1 costs 99.9t; remaining 400.1t / 15t = 26.673 -> 26.67
      expect(calculateCentiKwh(500, 4001)).toBe(999 + 2667);
    });
  });

  it("buys nothing when there is no money", () => {
    expect(calculateCentiKwh(0, 0)).toBe(0);
  });

  it("prices a new month from block 1 again once the monthly total is back to zero", () => {
    const lateLastMonth = calculateCentiKwh(500, kwh(250));
    const firstOfNewMonth = calculateCentiKwh(500, 0);
    expect(lateLastMonth).toBe(kwh(25));
    expect(firstOfNewMonth).toBe(kwh(50));
  });

  it("rejects fractional or negative inputs", () => {
    expect(() => calculateCentiKwh(500.5, 0)).toThrow(RangeError);
    expect(() => calculateCentiKwh(-1, 0)).toThrow(RangeError);
    expect(() => calculateCentiKwh(500, -1)).toThrow(RangeError);
  });
});
