import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { meterIdSchema } from "./meter-id.js";
import { getMeter, registerMeter } from "./meter.service.js";

const registerMeterBody = z.object({ meterId: meterIdSchema });
const meterParams = z.object({ id: meterIdSchema });

export async function meterRoutes(app: FastifyInstance) {
  app.post("/meters", async (request, reply) => {
    const { meterId } = registerMeterBody.parse(request.body);
    const meter = await registerMeter(meterId);
    return reply.code(201).send(meter);
  });

  app.get("/meters/:id", async (request) => {
    const { id } = meterParams.parse(request.params);
    return getMeter(id);
  });
}
