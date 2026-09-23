import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, registerMeter, resetDatabase } from "./helpers.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => app.close());

describe("POST /meters", () => {
  it("registers a meter with zero balance and DISCONNECTED status", async () => {
    const response = await app.inject({ method: "POST", url: "/meters", payload: { meterId: "MTR-001" } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      meterId: "MTR-001",
      balanceKwh: "0.00",
      status: "DISCONNECTED",
      purchasedThisMonthKwh: "0.00",
    });
    expect(Date.parse(response.json().createdAt)).not.toBeNaN();
  });

  it("normalises the meter ID to upper case", async () => {
    const meter = await registerMeter(app, " mtr-002 ");
    expect(meter.meterId).toBe("MTR-002");
  });

  it("rejects a meter ID that is already registered", async () => {
    await registerMeter(app, "MTR-001");
    const response = await app.inject({ method: "POST", url: "/meters", payload: { meterId: "MTR-001" } });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("METER_ALREADY_EXISTS");
  });

  it("rejects an invalid meter ID with field-level details", async () => {
    const response = await app.inject({ method: "POST", url: "/meters", payload: { meterId: "a b" } });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: [{ field: "meterId" }],
    });
  });

  it("rejects malformed JSON", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/meters",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("GET /meters/:id", () => {
  it("returns the meter", async () => {
    await registerMeter(app, "MTR-001");
    const response = await app.inject({ method: "GET", url: "/meters/MTR-001" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ meterId: "MTR-001", balanceKwh: "0.00", status: "DISCONNECTED" });
  });

  it("returns 404 for an unknown meter", async () => {
    const response = await app.inject({ method: "GET", url: "/meters/MTR-404" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });
});

describe("unknown routes", () => {
  it("use the same error shape as everything else", async () => {
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });
});

describe("GET /", () => {
  it("serves the test console page", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });
});
