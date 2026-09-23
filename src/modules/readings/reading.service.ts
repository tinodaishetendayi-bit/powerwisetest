import type { MeterStatus } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { lockMeter } from "../../db/lock-meter.js";
import { formatKwh, toCentiKwh } from "../../lib/kwh.js";
import { statusForBalance } from "../../services/meter-status.js";

export interface ReadingResult {
  readingId: string;
  meterId: string;
  kwhUsed: string;
  balanceKwh: string;
  status: MeterStatus;
  recordedAt: string;
}

/** Records usage since the previous reading. The balance never goes below zero. */
export async function recordReading(meterNumber: string, usedCentiKwh: number): Promise<ReadingResult> {
  return prisma.$transaction(async (tx) => {
    const meter = await lockMeter(tx, meterNumber);

    const newBalance = Math.max(toCentiKwh(meter.balanceKwh) - usedCentiKwh, 0);
    const status = statusForBalance(newBalance);

    const reading = await tx.reading.create({
      data: { meterId: meter.id, kwhUsed: formatKwh(usedCentiKwh) },
    });
    await tx.meter.update({
      where: { id: meter.id },
      data: { balanceKwh: formatKwh(newBalance), status },
    });

    return {
      readingId: reading.id,
      meterId: meter.meterNumber,
      kwhUsed: formatKwh(usedCentiKwh),
      balanceKwh: formatKwh(newBalance),
      status,
      recordedAt: reading.createdAt.toISOString(),
    };
  });
}
