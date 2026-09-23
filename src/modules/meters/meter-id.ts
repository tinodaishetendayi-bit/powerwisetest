import { z } from "zod";

// Meter IDs are the serial printed on the physical meter, e.g. "MTR-001".
export const meterIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,32}$/, "Meter ID must be 3-32 characters: letters, digits or hyphens");
