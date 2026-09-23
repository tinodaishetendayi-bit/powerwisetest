import { readFileSync } from "node:fs";
import Fastify, { type FastifyServerOptions } from "fastify";
import { prisma } from "./db/client.js";
import { errorHandler } from "./errors.js";
import { meterRoutes } from "./modules/meters/meter.routes.js";
import { purchaseRoutes } from "./modules/purchases/purchase.routes.js";
import { readingRoutes } from "./modules/readings/reading.routes.js";

// A small hand-written test console. It resolves the same way from src/ (tsx) and dist/ (node).
const consolePage = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: { code: "NOT_FOUND", message: `Route ${request.method} ${request.url} not found` },
    }),
  );

  app.get("/", (_request, reply) => reply.type("text/html").send(consolePage));
  app.get("/health", async () => ({ status: "ok" }));
  app.register(meterRoutes);
  app.register(purchaseRoutes);
  app.register(readingRoutes);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
