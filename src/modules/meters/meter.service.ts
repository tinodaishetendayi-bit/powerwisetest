import type { Meter } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { ConflictError, isUniqueViolation, NotFoundError } from "../../errors.js";
import { formatKwh, toCentiKwh } from "../../lib/kwh.js";
import { statusForBalance } from "../../services/meter-status.js";
import { sumPurchasedThisMonth } from "../purchases/purchase.service.js";

export interface MeterView {
  meterId: string;
  balanceKwh: string;
  status: Meter["status"];
  purchasedThisMonthKwh: string;
  createdAt: string;
}

export async function registerMeter(meterNumber: string): Promise<MeterView> {
  try {
    const meter = await prisma.meter.create({
      data: { meterNumber, balanceKwh: "0", status: statusForBalance(0) },
    });
    return toMeterView(meter, 0);
  } catch (error) {
    if (isUniqueViolation(error, "meter_number")) {
      throw new ConflictError("METER_ALREADY_EXISTS", `Meter ${meterNumber} is already registered`);
    }
    throw error;
  }
}

export async function getMeter(meterNumber: string): Promise<MeterView> {
  const meter = await prisma.meter.findUnique({ where: { meterNumber } });
  if (!meter) {
    throw new NotFoundError(`Meter ${meterNumber} not found`);
  }
  const purchasedThisMonth = await sumPurchasedThisMonth(prisma, meter.id);
  return toMeterView(meter, purchasedThisMonth);
}

function toMeterView(meter: Meter, purchasedThisMonthCentiKwh: number): MeterView {
  return {
    meterId: meter.meterNumber,
    balanceKwh: formatKwh(toCentiKwh(meter.balanceKwh)),
    status: meter.status,
    purchasedThisMonthKwh: formatKwh(purchasedThisMonthCentiKwh),
    createdAt: meter.createdAt.toISOString(),
  };
}
