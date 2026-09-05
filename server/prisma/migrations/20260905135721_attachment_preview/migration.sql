-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "previewFileId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_previewFileId_idx" ON "Attachment"("previewFileId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_previewFileId_fkey" FOREIGN KEY ("previewFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
