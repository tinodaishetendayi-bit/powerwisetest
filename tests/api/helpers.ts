import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { generateToken } from "../../src/services/token.js";

export { prisma };

export function createApp() {
  return buildApp({ logger: false });
}

export async function resetDatabase() {
  await prisma.$executeRawUnsafe("TRUNCATE TABLE readings, purchases, meters CASCADE");
}

type App = ReturnType<typeof createApp>;

export async function registerMeter(app: App, meterId: string) {
  const response = await app.inject({ method: "POST", url: "/meters", payload: { meterId } });
  if (response.statusCode !== 201) throw new Error(`Could not register ${meterId}: ${response.body}`);
  return response.json();
}

export function buy(app: App, meterId: string, amountInThebe: number, paymentReference: string) {
  return app.inject({
    method: "POST",
    url: "/purchases",
    payload: { meterId, amountInThebe, paymentReference },
  });
}

export function recordUsage(app: App, meterId: string, kwhUsed: number) {
  return app.inject({ method: "POST", url: `/meters/${meterId}/readings`, payload: { kwhUsed } });
}

export async function getMeter(app: App, meterId: string) {
  const response = await app.inject({ method: "GET", url: `/meters/${meterId}` });
  return response.json();
}

/** Inserts a historical purchase directly, e.g. to set up "already bought 40 kWh this month". */
export async function seedPurchase(meterId: string, kwh: string, createdAt = new Date()) {
  const meter = await prisma.meter.findUniqueOrThrow({ where: { meterNumber: meterId } });
  await prisma.purchase.create({
    data: {
      meterId: meter.id,
      paymentReference: `SEED-${Math.random().toString(36).slice(2)}`,
      amountThebe: 500,
      kwh,
      token: generateToken(),
      createdAt,
    },
  });
}
