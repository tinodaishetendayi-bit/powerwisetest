// Botswana is UTC+2 all year round (no daylight saving), so a fixed offset is enough.
const BOTSWANA_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;

/** The instant the current calendar month started in Botswana (Africa/Gaborone). */
export function startOfBillingMonth(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + BOTSWANA_UTC_OFFSET_MS);
  const localMonthStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return new Date(localMonthStart - BOTSWANA_UTC_OFFSET_MS);
}
