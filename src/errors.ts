import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class BusinessRuleError extends AppError {
  constructor(code: string, message: string) {
    super(422, code, message);
  }
}

interface UniqueViolationMeta {
  target?: string[];
  driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
}

/** True when Postgres rejected a write because of the unique constraint on `column`. */
export function isUniqueViolation(error: unknown, column: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  // The pg driver adapter reports the columns under driverAdapterError; the Rust engine uses target.
  const meta = error.meta as UniqueViolationMeta | undefined;
  const columns = meta?.driverAdapterError?.cause?.constraint?.fields ?? meta?.target ?? [];
  return columns.includes(column);
}

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
  }

  // Fastify's own client errors, e.g. malformed JSON or an unsupported content type.
  const statusCode = "statusCode" in error ? error.statusCode : undefined;
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return reply.code(statusCode).send({
      error: { code: "BAD_REQUEST", message: error.message },
    });
  }

  request.log.error({ err: error }, "Unhandled error");
  return reply.code(500).send({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}
