import type { Prisma, Purchase } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { lockMeter } from "../../db/lock-meter.js";
import { BusinessRuleError, ConflictError, isUniqueViolation } from "../../errors.js";
import { startOfBillingMonth } from "../../lib/billing-month.js";
import { formatKwh, toCentiKwh } from "../../lib/kwh.js";
import { statusForBalance } from "../../services/meter-status.js";
import { calculateCentiKwh, MIN_PURCHASE_THEBE } from "../../services/pricing.js";
import { generateToken } from "../../services/token.js";

const MAX_TOKEN_ATTEMPTS = 3;

export interface PurchaseRequest {
  meterId: string;
  amountInThebe: number;
  paymentReference: string;
}

export interface PurchaseReceipt {
  purchaseId: string;
  meterId: string;
  paymentReference: string;
  amountInThebe: number;
  kwhPurchased: string;
  token: string;
  purchasedAt: string;
}

export interface PurchaseResult {
  receipt: PurchaseReceipt;
  isReplay: boolean;
}

type PurchaseWithMeter = Purchase & { meter: { meterNumber: string } };

export async function purchaseElectricity(request: PurchaseRequest): Promise<PurchaseResult> {
  if (request.amountInThebe < MIN_PURCHASE_THEBE) {
    throw new BusinessRuleError(
      "BELOW_MINIMUM_PURCHASE",
      `Minimum purchase is P5.00 (${MIN_PURCHASE_THEBE} thebe)`,
    );
  }

  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => purchaseInTransaction(tx, request));
    } catch (error) {
      // Another request with the same payment reference committed first (possibly for a
      // different meter, so our meter lock didn't serialise us). Answer from what it stored.
      if (isUniqueViolation(error, "payment_reference")) {
        const existing = await findByPaymentReference(prisma, request.paymentReference);
        if (existing) return { receipt: replayReceipt(existing, request), isReplay: true };
      }
      if (isUniqueViolation(error, "token") && attempt < MAX_TOKEN_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }
}

async function purchaseInTransaction(
  tx: Prisma.TransactionClient,
  request: PurchaseRequest,
): Promise<PurchaseResult> {
  const meter = await lockMeter(tx, request.meterId);

  const existing = await findByPaymentReference(tx, request.paymentReference);
  if (existing) {
    return { receipt: replayReceipt(existing, request), isReplay: true };
  }

  // One timestamp for both pricing and the record, so a purchase at midnight can't be
  // priced in one month and stored in the next.
  const now = new Date();
  const purchasedThisMonth = await sumPurchasedThisMonth(tx, meter.id, now);
  const purchasedCentiKwh = calculateCentiKwh(request.amountInThebe, purchasedThisMonth);
  const newBalance = toCentiKwh(meter.balanceKwh) + purchasedCentiKwh;

  const purchase = await tx.purchase.create({
    data: {
      meterId: meter.id,
      paymentReference: request.paymentReference,
      amountThebe: request.amountInThebe,
      kwh: formatKwh(purchasedCentiKwh),
      token: generateToken(),
      createdAt: now,
    },
  });

  await tx.meter.update({
    where: { id: meter.id },
    data: { balanceKwh: formatKwh(newBalance), status: statusForBalance(newBalance) },
  });

  return { receipt: toReceipt(purchase, meter.meterNumber), isReplay: false };
}

/** Total kWh bought this calendar month, from the purchase records themselves. */
export async function sumPurchasedThisMonth(
  db: Prisma.TransactionClient,
  meterId: string,
  now: Date = new Date(),
): Promise<number> {
  const result = await db.purchase.aggregate({
    where: { meterId, createdAt: { gte: startOfBillingMonth(now) } },
    _sum: { kwh: true },
  });
  return result._sum.kwh ? toCentiKwh(result._sum.kwh) : 0;
}

function findByPaymentReference(
  db: Prisma.TransactionClient,
  paymentReference: string,
): Promise<PurchaseWithMeter | null> {
  return db.purchase.findUnique({
    where: { paymentReference },
    include: { meter: { select: { meterNumber: true } } },
  });
}

// A retried payment must describe the same purchase; otherwise the reference is being reused.
function replayReceipt(existing: PurchaseWithMeter, request: PurchaseRequest): PurchaseReceipt {
  const sameMeter = existing.meter.meterNumber === request.meterId;
  const sameAmount = existing.amountThebe === request.amountInThebe;
  if (!sameMeter || !sameAmount) {
    throw new ConflictError(
      "PAYMENT_REFERENCE_CONFLICT",
      `Payment reference ${request.paymentReference} was already used for a different purchase`,
    );
  }
  return toReceipt(existing, existing.meter.meterNumber);
}

function toReceipt(purchase: Purchase, meterNumber: string): PurchaseReceipt {
  return {
    purchaseId: purchase.id,
    meterId: meterNumber,
    paymentReference: purchase.paymentReference,
    amountInThebe: purchase.amountThebe,
    kwhPurchased: formatKwh(toCentiKwh(purchase.kwh)),
    token: purchase.token,
    purchasedAt: purchase.createdAt.toISOString(),
  };
}
