import { MeterStatus } from "@prisma/client";

export const LOW_BALANCE_THRESHOLD_CENTI_KWH = 10_00;

export function statusForBalance(balanceCentiKwh: number): MeterStatus {
  if (balanceCentiKwh <= 0) return MeterStatus.DISCONNECTED;
  if (balanceCentiKwh < LOW_BALANCE_THRESHOLD_CENTI_KWH) return MeterStatus.LOW_BALANCE;
  return MeterStatus.CONNECTED;
}
