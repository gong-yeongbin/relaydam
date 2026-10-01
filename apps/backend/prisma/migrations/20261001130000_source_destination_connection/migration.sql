-- CreateTable
CREATE TABLE "source" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "slug" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "signing_secret_enc" TEXT,
    "signature_config" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "headers_enc" TEXT,
    "timeout_ms" INTEGER NOT NULL DEFAULT 5000,
    "max_attempts" INTEGER NOT NULL DEFAULT 10,
    "concurrency" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection" (
    "source_id" INTEGER NOT NULL,
    "destination_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_pkey" PRIMARY KEY ("source_id","destination_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "source_slug_key" ON "source"("slug");

-- CreateIndex
CREATE INDEX "source_project_id_idx" ON "source"("project_id");

-- CreateIndex
CREATE INDEX "destination_project_id_idx" ON "destination"("project_id");

-- CreateIndex
CREATE INDEX "connection_destination_id_idx" ON "connection"("destination_id");

-- AddForeignKey
ALTER TABLE "source" ADD CONSTRAINT "source_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destination" ADD CONSTRAINT "destination_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 서명 시크릿과 설정은 둘 다 있거나 둘 다 없다. Prisma 스키마로 표현할 수 없어 직접 추가한다.
ALTER TABLE "source" ADD CONSTRAINT "source_signature_both_or_neither" CHECK (("signing_secret_enc" IS NULL) = ("signature_config" IS NULL));
