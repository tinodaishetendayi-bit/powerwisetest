import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { formatKwh, parseKwhInput, toCentiKwh } from "../../src/lib/kwh.js";

describe("kWh conversions", () => {
  it("formats centi-kWh with exactly two decimals", () => {
    expect(formatKwh(0)).toBe("0.00");
    expect(formatKwh(5)).toBe("0.05");
    expect(formatKwh(16000)).toBe("160.00");
    expect(formatKwh(3333)).toBe("33.33");
  });

  it("converts database decimals without float error", () => {
    expect(toCentiKwh(new Prisma.Decimal("0.29"))).toBe(29);
    expect(toCentiKwh(new Prisma.Decimal("1234567.89"))).toBe(123456789);
  });

  it("parses JSON numbers with up to 2 decimal places", () => {
    expect(parseKwhInput(12.5)).toBe(1250);
    expect(parseKwhInput(0.29)).toBe(29); // 0.29 * 100 = 28.999999999999996 in JS
    expect(parseKwhInput(1.005)).toBeNull();
  });
});
