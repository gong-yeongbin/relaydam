-- CreateEnum
CREATE TYPE "RetryStrategy" AS ENUM ('linear', 'exponential');

-- CreateEnum
CREATE TYPE "AttemptTrigger" AS ENUM ('initial', 'automatic', 'manual', 'bulk_retry', 'unpause');

-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE 'held';

-- AlterTable
ALTER TABLE "connection" ADD COLUMN     "paused_at" TIMESTAMPTZ(3),
ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "retry_interval_ms" INTEGER NOT NULL DEFAULT 300000,
ADD COLUMN     "retry_strategy" "RetryStrategy" NOT NULL DEFAULT 'exponential',
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "delivery" ADD COLUMN     "connection_id" INTEGER;

-- AlterTable
ALTER TABLE "destination" DROP COLUMN "max_attempts";

-- AlterTable
ALTER TABLE "event" ADD COLUMN     "method" VARCHAR(10) NOT NULL DEFAULT 'POST',
ADD COLUMN     "path" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "query" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "source_ip" VARCHAR(45);

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "signing_secret_enc" TEXT;

-- CreateTable
CREATE TABLE "delivery_attempt" (
    "id" BIGSERIAL NOT NULL,
    "delivery_id" BIGINT NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "trigger" "AttemptTrigger" NOT NULL,
    "status_code" INTEGER,
    "error" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "response_body" TEXT,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_attempt_delivery_id_idx" ON "delivery_attempt"("delivery_id");

-- CreateIndex
CREATE INDEX "delivery_connection_id_status_idx" ON "delivery"("connection_id", "status");

-- AddForeignKey
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

