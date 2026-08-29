-- AlterTable
ALTER TABLE "File" ADD COLUMN     "sourceSha256" TEXT;

-- Backfill: у всего, что загружено до R-30C, байты на диске совпадают с присланными.
UPDATE "File" SET "sourceSha256" = "sha256" WHERE "sourceSha256" IS NULL;

-- CreateIndex
CREATE INDEX "File_sourceSha256_idx" ON "File"("sourceSha256");
