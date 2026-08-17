-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'ANNOUNCEMENT';

-- AlterTable
ALTER TABLE "ChatMember" ADD COLUMN     "mutedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "announcementId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isService" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "versionName" TEXT NOT NULL,
    "changelog" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Announcement_versionCode_key" ON "Announcement"("versionCode");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
