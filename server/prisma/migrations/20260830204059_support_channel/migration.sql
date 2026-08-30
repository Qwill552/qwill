-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "isSupportRequest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "supportMutedUntil" TIMESTAMP(3);
