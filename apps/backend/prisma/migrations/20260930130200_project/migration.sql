-- CreateTable
CREATE TABLE "project" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "suspended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_organization_id_idx" ON "project"("organization_id");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
