/*
  Warnings:

  - You are about to drop the column `avatarUrl` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "thumbnailFileId" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "avatarUrl",
ADD COLUMN     "avatarFileId" TEXT;

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tempPath" TEXT NOT NULL,
    "receivedBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadSession_userId_idx" ON "UploadSession"("userId");

-- CreateIndex
CREATE INDEX "Attachment_thumbnailFileId_idx" ON "Attachment"("thumbnailFileId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_thumbnailFileId_fkey" FOREIGN KEY ("thumbnailFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
