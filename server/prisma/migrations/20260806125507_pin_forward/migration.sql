-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "pinnedMessageId" INTEGER;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "forwardedFromId" INTEGER;

-- CreateIndex
CREATE INDEX "Message_forwardedFromId_idx" ON "Message"("forwardedFromId");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_pinnedMessageId_fkey" FOREIGN KEY ("pinnedMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_forwardedFromId_fkey" FOREIGN KEY ("forwardedFromId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
