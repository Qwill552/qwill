-- CreateEnum
CREATE TYPE "LinkPreviewStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "LinkPreview" (
    "url" TEXT NOT NULL,
    "status" "LinkPreviewStatus" NOT NULL DEFAULT 'PENDING',
    "siteName" TEXT,
    "title" TEXT,
    "description" TEXT,
    "imageFileId" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkPreview_pkey" PRIMARY KEY ("url")
);

-- CreateIndex
CREATE INDEX "LinkPreview_imageFileId_idx" ON "LinkPreview"("imageFileId");

-- AddForeignKey
ALTER TABLE "LinkPreview" ADD CONSTRAINT "LinkPreview_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
