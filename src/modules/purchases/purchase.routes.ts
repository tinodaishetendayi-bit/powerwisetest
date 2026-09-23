import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { meterIdSchema } from "../meters/meter-id.js";
import { purchaseElectricity } from "./purchase.service.js";

const purchaseBody = z.object({
  meterId: meterIdSchema,
  amountInThebe: z
    .number()
    .int("amountInThebe must be a whole number of thebe")
    .positive()
    .max(100_000_000, "amountInThebe is unrealistically large"),
  paymentReference: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_\-:.]+$/, "paymentReference contains invalid characters"),
});

export async function purchaseRoutes(app: FastifyInstance) {
  app.post("/purchases", async (request, reply) => {
    const body = purchaseBody.parse(request.body);
    const { receipt, isReplay } = await purchaseElectricity(body);
    // 201 for a new purchase, 200 when we are replaying the original result.
    return reply.code(isReplay ? 200 : 201).send(receipt);
  });
}
