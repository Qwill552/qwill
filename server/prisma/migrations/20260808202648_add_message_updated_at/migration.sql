-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Message_chatId_updatedAt_idx" ON "Message"("chatId", "updatedAt");

UPDATE "Message" SET "updatedAt" = "createdAt";
