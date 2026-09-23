import type { Meter, Prisma } from "@prisma/client";
import { NotFoundError } from "../errors.js";

/**
 * Loads a meter and holds a row lock on it until the transaction ends.
 * Any other transaction that tries to lock the same meter waits here,
 * so purchases and readings for one meter are applied one at a time.
 */
export async function lockMeter(tx: Prisma.TransactionClient, meterNumber: string): Promise<Meter> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM meters WHERE meter_number = ${meterNumber} FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    throw new NotFoundError(`Meter ${meterNumber} not found`);
  }
  return tx.meter.findUniqueOrThrow({ where: { id: row.id } });
}
