-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'succeeded', 'failed', 'dead', 'canceled');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('payload_too_large', 'project_suspended', 'no_connection', 'signature_missing', 'signature_mismatch', 'timestamp_out_of_range', 'usage_exceeded');

-- CreateTable
CREATE TABLE "event" (
    "id" BIGSERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "source_id" INTEGER,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "headers" JSONB NOT NULL,
    "body" BYTEA NOT NULL,
    "content_type" VARCHAR(255),
    "size" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery" (
    "id" BIGSERIAL NOT NULL,
    "event_id" BIGINT NOT NULL,
    "destination_id" INTEGER,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3),
    "last_status_code" INTEGER,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rejected_request" (
    "id" BIGSERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "source_id" INTEGER,
    "reason" "RejectionReason" NOT NULL,
    "headers" JSONB NOT NULL,
    "size" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rejected_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_source_id_received_at_idx" ON "event"("source_id", "received_at");

-- CreateIndex
CREATE INDEX "event_project_id_id_idx" ON "event"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "event_source_id_idempotency_key_key" ON "event"("source_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "delivery_event_id_idx" ON "delivery"("event_id");

-- CreateIndex
CREATE INDEX "delivery_status_next_attempt_at_idx" ON "delivery"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "delivery_destination_id_status_idx" ON "delivery"("destination_id", "status");

-- CreateIndex
CREATE INDEX "rejected_request_project_id_id_idx" ON "rejected_request"("project_id", "id");

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rejected_request" ADD CONSTRAINT "rejected_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rejected_request" ADD CONSTRAINT "rejected_request_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

