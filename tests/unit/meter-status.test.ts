import { describe, expect, it } from "vitest";
import { statusForBalance } from "../../src/services/meter-status.js";

describe("statusForBalance", () => {
  it.each([
    [0, "DISCONNECTED"],
    [1, "LOW_BALANCE"], // 0.01 kWh
    [999, "LOW_BALANCE"], // 9.99 kWh
    [1000, "CONNECTED"], // 10.00 kWh
    [1001, "CONNECTED"], // 10.01 kWh
  ])("%i centi-kWh -> %s", (balance, expected) => {
    expect(statusForBalance(balance)).toBe(expected);
  });
});
