-- AlterTable
ALTER TABLE "ChatMember" ADD COLUMN     "clearedUpToMessageId" INTEGER,
ADD COLUMN     "hiddenAt" TIMESTAMP(3);
