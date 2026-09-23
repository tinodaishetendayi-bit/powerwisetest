-- CreateEnum
CREATE TYPE "MeterStatus" AS ENUM ('CONNECTED', 'LOW_BALANCE', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "meters" (
    "id" UUID NOT NULL,
    "meter_number" VARCHAR(32) NOT NULL,
    "balance_kwh" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "MeterStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "meter_id" UUID NOT NULL,
    "payment_reference" VARCHAR(64) NOT NULL,
    "amount_thebe" INTEGER NOT NULL,
    "kwh" DECIMAL(12,2) NOT NULL,
    "token" CHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readings" (
    "id" UUID NOT NULL,
    "meter_id" UUID NOT NULL,
    "kwh_used" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meters_meter_number_key" ON "meters"("meter_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_payment_reference_key" ON "purchases"("payment_reference");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_token_key" ON "purchases"("token");

-- CreateIndex
CREATE INDEX "purchases_meter_id_created_at_idx" ON "purchases"("meter_id", "created_at");

-- CreateIndex
CREATE INDEX "readings_meter_id_created_at_idx" ON "readings"("meter_id", "created_at");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readings" ADD CONSTRAINT "readings_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants Prisma can't express in the schema file. These are the last line of
-- defence if a bug (or a manual query) ever tries to write impossible data.
ALTER TABLE "meters" ADD CONSTRAINT "meters_balance_non_negative" CHECK ("balance_kwh" >= 0);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_minimum_amount" CHECK ("amount_thebe" >= 500);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_kwh_positive" CHECK ("kwh" > 0);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_token_format" CHECK ("token" ~ '^[0-9]{20}$');
ALTER TABLE "readings" ADD CONSTRAINT "readings_kwh_used_non_negative" CHECK ("kwh_used" >= 0);
