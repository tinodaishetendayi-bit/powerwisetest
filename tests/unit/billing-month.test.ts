import { describe, expect, it } from "vitest";
import { startOfBillingMonth } from "../../src/lib/billing-month.js";

describe("startOfBillingMonth (Africa/Gaborone, UTC+2)", () => {
  it("returns midnight on the 1st in Botswana time", () => {
    expect(startOfBillingMonth(new Date("2026-09-15T12:00:00Z")).toISOString()).toBe(
      "2026-08-31T22:00:00.000Z",
    );
  });

  it("uses Botswana's date, not UTC's, around midnight", () => {
    // 22:30 UTC on 30 Sep is already 00:30 on 1 Oct in Gaborone.
    expect(startOfBillingMonth(new Date("2026-09-30T22:30:00Z")).toISOString()).toBe(
      "2026-09-30T22:00:00.000Z",
    );
    // 21:59 UTC on 30 Sep is still September in Gaborone.
    expect(startOfBillingMonth(new Date("2026-09-30T21:59:00Z")).toISOString()).toBe(
      "2026-08-31T22:00:00.000Z",
    );
  });

  it("handles the year boundary", () => {
    expect(startOfBillingMonth(new Date("2026-12-31T23:00:00Z")).toISOString()).toBe(
      "2026-12-31T22:00:00.000Z",
    );
  });
});
