-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN     "fcmToken" TEXT,
ALTER COLUMN "endpoint" DROP NOT NULL,
ALTER COLUMN "p256dh" DROP NOT NULL,
ALTER COLUMN "auth" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_fcmToken_key" ON "PushSubscription"("fcmToken");

