import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseKwhInput } from "../../lib/kwh.js";
import { meterIdSchema } from "../meters/meter-id.js";
import { recordReading } from "./reading.service.js";

const readingParams = z.object({ id: meterIdSchema });

const readingBody = z.object({
  kwhUsed: z
    .number()
    .nonnegative("kwhUsed cannot be negative")
    .max(1_000_000, "kwhUsed is unrealistically large")
    .transform((kwh, ctx) => {
      const centiKwh = parseKwhInput(kwh);
      if (centiKwh === null) {
        ctx.addIssue({ code: "custom", message: "kwhUsed can have at most 2 decimal places" });
        return z.NEVER;
      }
      return centiKwh;
    }),
});

export async function readingRoutes(app: FastifyInstance) {
  app.post("/meters/:id/readings", async (request, reply) => {
    const { id } = readingParams.parse(request.params);
    const { kwhUsed } = readingBody.parse(request.body);
    const result = await recordReading(id, kwhUsed);
    return reply.code(201).send(result);
  });
}
