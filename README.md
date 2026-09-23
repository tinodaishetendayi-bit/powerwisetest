# Powerwise Prepaid Meter Service

## Overview

A backend for prepaid electricity meters in Botswana. It registers meters, sells electricity using monthly progressive block pricing, records usage readings and reports meter status. Money is Botswana Pula (BWP), handled as integer **thebe** (P1.00 = 100 thebe).

## Architecture

```
HTTP request
  → Fastify route          (src/modules/*/*.routes.ts)    parse + validate with Zod, pick status code
  → service function       (src/modules/*/*.service.ts)   business rules, transaction, locking
  → pure domain functions  (src/services/*.ts)            pricing, meter status, token
  → Prisma → PostgreSQL
```

```
src/
  app.ts, server.ts         Fastify setup and process entry point
  config.ts                 environment variables validated with Zod
  errors.ts                 AppError types and the single error handler
  db/client.ts              Prisma client (pg driver adapter)
  db/lock-meter.ts          SELECT ... FOR UPDATE on a meter row
  lib/kwh.ts                kWh <-> integer centi-kWh conversions
  lib/billing-month.ts      start of the current month in Africa/Gaborone
  services/pricing.ts       progressive block pricing (pure)
  services/meter-status.ts  balance → status (pure)
  services/token.ts         20-digit token generation
  modules/meters|purchases|readings/
public/index.html           test console served at GET /
tests/unit                  pure tests, no database needed
tests/api                   HTTP tests through app.inject against a real PostgreSQL
prisma/                     schema and migrations
```

Route handlers do not contain business logic. The pricing, status and token code does not know about HTTP or the database, so it can be tested on its own.

## Technology Stack

Node.js 22, TypeScript (strict), Fastify 5, PostgreSQL 16, Prisma 6, Zod 4, Vitest 4, npm.

Prisma runs with `engineType = "client"` and `@prisma/adapter-pg`, so queries go through the standard `pg` driver instead of Prisma's Rust query engine binary. This is the default direction for Prisma 7. It also gives us a normal `pg` connection pool.

## Running Locally

```bash
cp .env.example .env
docker compose up -d          # PostgreSQL 16; also creates the powerwise_test database
npm install
npm run db:deploy             # apply migrations (npm run db:migrate while developing)
npm run dev                   # http://localhost:3000
```

For a production build, run `npm run build && npm start`. To try the API by hand, open http://localhost:3000 for a small test console (`public/index.html`, plain HTML and JS with no build step), or use the ready-to-run requests in `requests.http`.

## Environment Variables

| Variable            | Default   | Purpose                                     |
| ------------------- | --------- | ------------------------------------------- |
| `DATABASE_URL`      | required  | PostgreSQL connection string                |
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/powerwise_test` | database used by `npm test` |
| `PORT`              | `3000`    | HTTP port                                   |
| `HOST`              | `0.0.0.0` | bind address                                |
| `LOG_LEVEL`         | `info`    | pino log level                              |

## Database Setup

Three tables. All primary keys are UUIDs, and all timestamps are `timestamptz`.

- **meters**: `meter_number` UNIQUE, `balance_kwh NUMERIC(12,2)` with CHECK ≥ 0, `status` enum.
- **purchases**: FK to meters, `payment_reference` UNIQUE (idempotency), `amount_thebe INT` with CHECK ≥ 500, `kwh NUMERIC(12,2)` with CHECK > 0, `token CHAR(20)` UNIQUE with CHECK `^[0-9]{20}$`, and an index on `(meter_id, created_at)` for the monthly total.
- **readings**: FK to meters, `kwh_used NUMERIC(12,2)` with CHECK ≥ 0, and an index on `(meter_id, created_at)`.

The CHECK constraints are added by hand at the end of the initial migration, because Prisma's schema language cannot express them. Foreign keys use `ON DELETE RESTRICT`, so a meter with history cannot be deleted by accident.

## API Endpoints

Errors always have this shape: `{ "error": { "code", "message", "details?" } }`.

| Method & path               | Body                                            | Success | Errors |
| --------------------------- | ----------------------------------------------- | ------- | ------ |
| `POST /meters`              | `{ "meterId": "MTR-001" }`                      | 201     | 400, 409 `METER_ALREADY_EXISTS` |
| `GET /meters/:id`           | —                                               | 200     | 404 |
| `POST /purchases`           | `{ "meterId", "amountInThebe", "paymentReference" }` | 201 (new), 200 (replay) | 400, 404, 409 `PAYMENT_REFERENCE_CONFLICT`, 422 `BELOW_MINIMUM_PURCHASE` |
| `POST /meters/:id/readings` | `{ "kwhUsed": 12.5 }`                           | 201     | 400, 404 |

kWh values in responses are decimal **strings** with two places (`"160.00"`), so no client ever has to parse a float.

```jsonc
// POST /purchases  { "meterId": "MTR-001", "amountInThebe": 2350, "paymentReference": "PAY-12345" }
{ "purchaseId": "…", "meterId": "MTR-001", "paymentReference": "PAY-12345", "amountInThebe": 2350,
  "kwhPurchased": "160.00", "token": "48210937465019283746", "purchasedAt": "2026-09-23T10:00:00.000Z" }

// GET /meters/MTR-001
{ "meterId": "MTR-001", "balanceKwh": "200.00", "status": "CONNECTED",
  "purchasedThisMonthKwh": "200.00", "createdAt": "…" }
```

## Pricing Rules

| Block | Monthly kWh | Price |
| ----- | ----------- | ----- |
| 1 | 0 – 50     | P0.10/kWh (10 thebe) |
| 2 | 50 – 200   | P0.15/kWh (15 thebe) |
| 3 | above 200  | P0.20/kWh (20 thebe) |

The minimum purchase is P5.00 (500 thebe). Blocks reset on the 1st of each month. "Purchased this month" is always the sum of that meter's purchase records since the start of the month. It is not a stored counter, so nothing has to be reset.

**No floating point.** `0.1 + 0.2 !== 0.3` in JavaScript, and that kind of error in money compounds. Money is stored as integer thebe. Energy is integer centi-kWh (0.01 kWh) inside the app and `NUMERIC(12,2)` in PostgreSQL. The pricing loop keeps the budget in hundredths of a thebe. That means a price of *N* thebe/kWh is also *N* budget units per centi-kWh, and `Math.floor(budget / price)` is exact integer division that rounds down to 0.01 kWh.

Example (40 kWh already bought, P23.50): 10 kWh × 10t = 100t finishes block 1. The remaining 2250t ÷ 15t = 150 kWh. The total is **160.00 kWh**.

## Meter Status Rules

`statusForBalance()` in `src/services/meter-status.ts` is the only place status is decided. Both purchases and readings call it.

| Balance        | Status         |
| -------------- | -------------- |
| 0              | `DISCONNECTED` |
| 0.01 – 9.99    | `LOW_BALANCE`  |
| ≥ 10.00        | `CONNECTED`    |

## Idempotency

Payment providers retry. `payment_reference` has a UNIQUE constraint, and the purchase service checks for an existing reference *after* it has locked the meter row.

| Same reference arrives again with…     | Result |
| -------------------------------------- | ------ |
| same meter, same amount                | `200` with the **original** receipt (same token). The meter is not credited again. |
| different meter or different amount    | `409 PAYMENT_REFERENCE_CONFLICT`. This is a provider bug or a reused reference, so we surface it instead of hiding it. |

If two requests with the same reference race on *different* meters, the meter lock does not serialise them. The unique index does: the loser's INSERT fails, the transaction rolls back, and the service answers from the committed row with a replay or a 409.

## Concurrency

The race: the meter has bought 40 kWh this month, and two P23.50 purchases arrive together. Both read "40 kWh", and both get 160 kWh at block 1–2 prices. The second one should have been priced in block 3 (117.50 kWh). Both also write the balance from the same starting value, so one credit is lost.

The fix: each purchase and reading runs in one transaction that begins with `SELECT … FROM meters WHERE meter_number = $1 FOR UPDATE`. The second transaction waits on that row lock until the first commits. It then reads the updated monthly total and balance. The lock is per meter, so different meters do not block each other. `tests/api/concurrency.test.ts` proves this: with the `FOR UPDATE` removed, the test fails.

Because the transaction is atomic, the system cannot end up with a credited meter but no purchase row, or the reverse. Any error rolls back everything.

## Testing

```bash
npm test            # everything (API tests need PostgreSQL; migrations are applied automatically)
npm run test:unit   # pricing, status, token, month boundary, kWh conversions — no database
```

- The unit tests cover every pricing block and boundary, rounding down, month-to-date totals that are not whole kWh, and the Botswana month boundary.
- The API tests cover registration, purchases, validation, the minimum amount, duplicates and conflicts, readings, status changes and reconnection.
- The concurrency tests cover simultaneous purchases, five identical retries arriving at once, and a race on the unique constraint.

## Assumptions

- **Meter ID** is the serial number on the physical meter and is supplied by the client (`^[A-Z0-9-]{3,32}$`, normalised to upper case). An internal UUID is the primary key.
- **A new meter** starts at 0 kWh, so its status is `DISCONNECTED`.
- **Calendar month** means the month in Botswana (Africa/Gaborone, UTC+2, no DST).
- **Leftover money.** When an amount can't buy another 0.01 kWh, the remainder (always less than 0.2 thebe) is kept by the utility and not refunded. The receipt records the full amount paid.
- **Readings** are interval usage ("kWh used since the previous reading"), not cumulative register values. Usage larger than the balance is recorded in full, and the balance stops at 0.
- **Duplicate payments** are handled as described in the Idempotency section. A replay returns 200 rather than 201 so the caller can tell nothing new was created.
- **Tokens** are 20 digits from `crypto.randomInt` and never start with 0. The database guarantees uniqueness. A collision (about 1 in 9×10¹⁹) retries the whole transaction, up to 3 times.
- **Precision.** kWh is stored with 2 decimal places, which matches the rounding rule.

## Trade-offs

- **Pessimistic row locks** instead of `SERIALIZABLE` plus retries. Row locks are simpler and correct, and contention is per meter, which is low. Throughput for a single meter is serialised, which is fine.
- **Status is stored** even though it can be derived from the balance. Storing it makes reads and queries by status easy. The cost is that every write must go through `statusForBalance()`.
- **Monthly total is computed with SUM** on an indexed column instead of being kept in a counter. This is always correct across month boundaries, and it's cheap at this scale.
- **Validation in handlers with `schema.parse()`** instead of a Fastify type provider. There's one less dependency and the flow is explicit. The trade-off is that there's no auto-generated OpenAPI.

## What I Would Improve With More Time

- Authentication for payment providers (API keys or HMAC-signed webhooks) and rate limiting.
- An OpenAPI spec generated from the Zod schemas.
- Store the tariff in the database with effective dates, so a price change doesn't need a deploy.
- Readings with meter-side timestamps and sequence numbers, so late or duplicated readings are detected.
- A `Dockerfile`, CI (typecheck, lint and tests), structured audit logging of balance changes, and metrics.
- Tune transaction timeouts, and return `503` with `Retry-After` when lock waits exceed them under heavy load.
