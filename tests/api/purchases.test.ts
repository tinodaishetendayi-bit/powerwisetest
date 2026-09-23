import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buy, createApp, getMeter, prisma, registerMeter, resetDatabase, seedPurchase } from "./helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  await registerMeter(app, "MTR-001");
});
afterAll(() => app.close());

describe("POST /purchases", () => {
  it("credits the meter and returns a receipt with a 20-digit token", async () => {
    const response = await buy(app, "MTR-001", 500, "PAY-1");

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      meterId: "MTR-001",
      paymentReference: "PAY-1",
      amountInThebe: 500,
      kwhPurchased: "50.00",
    });
    expect(response.json().token).toMatch(/^\d{20}$/);

    const meter = await getMeter(app, "MTR-001");
    expect(meter).toMatchObject({ balanceKwh: "50.00", status: "CONNECTED", purchasedThisMonthKwh: "50.00" });
  });

  it("prices from what the meter already bought this month (challenge example)", async () => {
    await seedPurchase("MTR-001", "40.00");

    const response = await buy(app, "MTR-001", 2350, "PAY-1");

    expect(response.json().kwhPurchased).toBe("160.00");
    expect((await getMeter(app, "MTR-001")).purchasedThisMonthKwh).toBe("200.00");
  });

  it("resets the pricing blocks in a new calendar month", async () => {
    await seedPurchase("MTR-001", "250.00", new Date("2020-01-15T10:00:00Z"));

    const response = await buy(app, "MTR-001", 500, "PAY-1");

    expect(response.json().kwhPurchased).toBe("50.00");
    expect((await getMeter(app, "MTR-001")).purchasedThisMonthKwh).toBe("50.00");
  });

  it("returns 404 for an unknown meter", async () => {
    const response = await buy(app, "MTR-999", 500, "PAY-1");
    expect(response.statusCode).toBe(404);
  });

  it("rejects purchases below P5.00 and accepts exactly P5.00", async () => {
    const tooSmall = await buy(app, "MTR-001", 499, "PAY-1");
    expect(tooSmall.statusCode).toBe(422);
    expect(tooSmall.json().error.code).toBe("BELOW_MINIMUM_PURCHASE");

    const minimum = await buy(app, "MTR-001", 500, "PAY-2");
    expect(minimum.statusCode).toBe(201);
  });

  it.each([
    ["decimal pula instead of thebe", { meterId: "MTR-001", amountInThebe: 23.5, paymentReference: "PAY-1" }],
    ["amount as a string", { meterId: "MTR-001", amountInThebe: "2350", paymentReference: "PAY-1" }],
    ["negative amount", { meterId: "MTR-001", amountInThebe: -500, paymentReference: "PAY-1" }],
    ["missing payment reference", { meterId: "MTR-001", amountInThebe: 500 }],
  ])("rejects %s with 400", async (_label, payload) => {
    const response = await app.inject({ method: "POST", url: "/purchases", payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("gives each purchase a different token", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 5; i++) {
      tokens.add((await buy(app, "MTR-001", 500, `PAY-${i}`)).json().token);
    }
    expect(tokens.size).toBe(5);
  });
});

describe("duplicate payment references", () => {
  it("returns the original receipt with 200 and does not credit the meter again", async () => {
    const first = await buy(app, "MTR-001", 500, "PAY-123");
    const second = await buy(app, "MTR-001", 500, "PAY-123");

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());

    expect((await getMeter(app, "MTR-001")).balanceKwh).toBe("50.00");
    expect(await prisma.purchase.count()).toBe(1);
  });

  it("rejects a reused reference with a different amount", async () => {
    await buy(app, "MTR-001", 500, "PAY-123");
    const response = await buy(app, "MTR-001", 1000, "PAY-123");

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("PAYMENT_REFERENCE_CONFLICT");
    expect((await getMeter(app, "MTR-001")).balanceKwh).toBe("50.00");
  });

  it("rejects a reused reference for a different meter", async () => {
    await registerMeter(app, "MTR-002");
    await buy(app, "MTR-001", 500, "PAY-123");
    const response = await buy(app, "MTR-002", 500, "PAY-123");

    expect(response.statusCode).toBe(409);
    expect((await getMeter(app, "MTR-002")).balanceKwh).toBe("0.00");
  });
});
