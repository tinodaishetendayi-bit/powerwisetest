export const MIN_PURCHASE_THEBE = 500;

interface PriceBlock {
  upToCentiKwh: number;
  thebePerKwh: number;
}

// Blocks reset every calendar month. Boundaries are in centi-kWh (5000 = 50 kWh).
export const PRICE_BLOCKS: readonly PriceBlock[] = [
  { upToCentiKwh: 50_00, thebePerKwh: 10 },
  { upToCentiKwh: 200_00, thebePerKwh: 15 },
  { upToCentiKwh: Infinity, thebePerKwh: 20 },
];

/**
 * Returns how many centi-kWh `amountThebe` buys, given what the meter has already bought this month.
 *
 * All maths is integer: the budget is held in hundredths of a thebe, so a price of N thebe per kWh
 * is also N budget units per centi-kWh. Integer division rounds down to the nearest 0.01 kWh.
 */
export function calculateCentiKwh(amountThebe: number, purchasedThisMonthCentiKwh: number): number {
  if (!Number.isSafeInteger(amountThebe) || amountThebe < 0) {
    throw new RangeError("amountThebe must be a non-negative integer");
  }
  if (!Number.isSafeInteger(purchasedThisMonthCentiKwh) || purchasedThisMonthCentiKwh < 0) {
    throw new RangeError("purchasedThisMonthCentiKwh must be a non-negative integer");
  }

  let budget = amountThebe * 100;
  let monthTotal = purchasedThisMonthCentiKwh;
  let bought = 0;

  for (const block of PRICE_BLOCKS) {
    if (monthTotal >= block.upToCentiKwh) continue;

    const roomInBlock = block.upToCentiKwh - monthTotal;
    const affordable = Math.floor(budget / block.thebePerKwh);
    const units = Math.min(roomInBlock, affordable);

    bought += units;
    monthTotal += units;
    budget -= units * block.thebePerKwh;

    if (units < roomInBlock) break;
  }

  return bought;
}
