-- AlterTable
ALTER TABLE "connection" DROP CONSTRAINT "connection_pkey",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "connection_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "connection_source_id_destination_id_key" ON "connection"("source_id", "destination_id");

