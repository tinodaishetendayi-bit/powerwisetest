import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generateToken } from "../../src/services/token.js";
import { buy, createApp, getMeter, prisma, registerMeter, resetDatabase, seedPurchase } from "./helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  await registerMeter(app, "MTR-001");
});
afterAll(() => app.close());

describe("concurrent requests", () => {
  it("prices simultaneous purchases one after the other", async () => {
    await seedPurchase("MTR-001", "40.00");

    const responses = await Promise.all([
      buy(app, "MTR-001", 2350, "PAY-A"),
      buy(app, "MTR-001", 2350, "PAY-B"),
    ]);

    // Whichever runs first takes 40 -> 200 kWh (160 kWh); the second is fully in block 3 (117.50 kWh).
    // Without the row lock, both would read 40 kWh and each get 160 kWh.
    const bought = responses.map((r) => r.json().kwhPurchased).sort();
    expect(bought).toEqual(["117.50", "160.00"]);
    expect((await getMeter(app, "MTR-001")).balanceKwh).toBe("277.50");
  });

  it("credits a payment only once when the same reference arrives several times at once", async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => buy(app, "MTR-001", 500, "PAY-DUP")),
    );

    const statusCodes = responses.map((r) => r.statusCode).sort();
    expect(statusCodes).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((r) => r.json().token)).size).toBe(1);
    expect((await getMeter(app, "MTR-001")).balanceKwh).toBe("50.00");
  });

  describe("while another purchase with the same reference is still uncommitted", () => {
    // Holds a purchase open in its own transaction so the request under test is guaranteed
    // to overlap with it.
    async function withUncommittedPurchase(meterId: string, whileOpen: () => Promise<void>) {
      const meter = await prisma.meter.findUniqueOrThrow({ where: { meterNumber: meterId } });
      await prisma.$transaction(async (tx) => {
        await tx.purchase.create({
          data: {
            meterId: meter.id,
            paymentReference: "PAY-RACE",
            amountThebe: 500,
            kwh: "50.00",
            token: generateToken(),
          },
        });
        await whileOpen();
      });
    }

    // The open INSERT's foreign key check holds a KEY SHARE lock on the meter row, so our
    // SELECT ... FOR UPDATE waits for it to commit and then finds it in the idempotency lookup.
    it("waits and replays it for the same meter and amount", async () => {
      let pending!: ReturnType<typeof buy>;
      await withUncommittedPurchase("MTR-001", async () => {
        pending = buy(app, "MTR-001", 500, "PAY-RACE");
        await sleep(200);
      });

      const response = await pending;
      expect(response.statusCode).toBe(200);
      expect(response.json().kwhPurchased).toBe("50.00");
      expect(await prisma.purchase.count()).toBe(1);
      expect((await getMeter(app, "MTR-001")).balanceKwh).toBe("0.00");
    });

    // A different meter isn't locked, so this request reaches its own INSERT and is stopped by
    // the unique index on payment_reference. The service catches that and answers with 409.
    it("is stopped by the unique constraint for a different meter (409)", async () => {
      await registerMeter(app, "MTR-002");
      let pending!: ReturnType<typeof buy>;
      await withUncommittedPurchase("MTR-001", async () => {
        pending = buy(app, "MTR-002", 500, "PAY-RACE");
        await sleep(200);
      });

      const response = await pending;
      expect(response.statusCode).toBe(409);
      expect((await getMeter(app, "MTR-002")).balanceKwh).toBe("0.00");
    });
  });
});
