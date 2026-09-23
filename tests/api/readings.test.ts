import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buy, createApp, getMeter, registerMeter, recordUsage, resetDatabase } from "./helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  await registerMeter(app, "MTR-001");
  await buy(app, "MTR-001", 500, "PAY-1"); // 50.00 kWh
});
afterAll(() => app.close());

describe("POST /meters/:id/readings", () => {
  it("subtracts usage from the balance", async () => {
    const response = await recordUsage(app, "MTR-001", 12.5);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ kwhUsed: "12.50", balanceKwh: "37.50", status: "CONNECTED" });
    expect((await getMeter(app, "MTR-001")).balanceKwh).toBe("37.50");
  });

  it("rejects negative usage", async () => {
    const response = await recordUsage(app, "MTR-001", -1);

    expect(response.statusCode).toBe(400);
    expect((await getMeter(app, "MTR-001")).balanceKwh).toBe("50.00");
  });

  it("rejects usage with more than 2 decimal places", async () => {
    const response = await recordUsage(app, "MTR-001", 1.234);
    expect(response.statusCode).toBe(400);
  });

  it("disconnects the meter when usage reaches zero balance", async () => {
    const response = await recordUsage(app, "MTR-001", 50);
    expect(response.json()).toMatchObject({ balanceKwh: "0.00", status: "DISCONNECTED" });
  });

  it("never lets the balance go negative", async () => {
    const response = await recordUsage(app, "MTR-001", 80);
    expect(response.json()).toMatchObject({ kwhUsed: "80.00", balanceKwh: "0.00", status: "DISCONNECTED" });
  });

  it("marks the meter LOW_BALANCE below 10 kWh", async () => {
    const response = await recordUsage(app, "MTR-001", 40.01);
    expect(response.json()).toMatchObject({ balanceKwh: "9.99", status: "LOW_BALANCE" });
  });

  it("keeps the meter CONNECTED at exactly 10 kWh", async () => {
    const response = await recordUsage(app, "MTR-001", 40);
    expect(response.json()).toMatchObject({ balanceKwh: "10.00", status: "CONNECTED" });
  });

  it("reconnects a disconnected meter after a purchase", async () => {
    await recordUsage(app, "MTR-001", 50);
    expect((await getMeter(app, "MTR-001")).status).toBe("DISCONNECTED");

    await buy(app, "MTR-001", 2000, "PAY-2"); // 50 kWh already bought -> 2000t / 15t = 133.33 kWh

    expect(await getMeter(app, "MTR-001")).toMatchObject({ balanceKwh: "133.33", status: "CONNECTED" });
  });

  it("returns 404 for an unknown meter", async () => {
    const response = await recordUsage(app, "MTR-404", 1);
    expect(response.statusCode).toBe(404);
  });
});
