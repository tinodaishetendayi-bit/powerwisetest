import { Prisma } from "@prisma/client";

// Inside the app, energy is an integer number of centi-kWh (1 centi-kWh = 0.01 kWh).
// The database stores NUMERIC(12,2) kWh, so converting at the edges is exact.

export function toCentiKwh(kwh: Prisma.Decimal): number {
  return kwh.mul(100).toNumber();
}

export function formatKwh(centiKwh: number): string {
  const whole = Math.floor(centiKwh / 100);
  const fraction = String(centiKwh % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

// JSON input arrives as a JS number (e.g. 12.5). Returns null if it has more than 2 decimal places.
export function parseKwhInput(kwh: number): number | null {
  const centiKwh = Math.round(kwh * 100);
  return Math.abs(kwh * 100 - centiKwh) < 1e-6 ? centiKwh : null;
}
