ALTER TABLE "Announcement" RENAME COLUMN "versionCode" TO "androidVersionCode";
ALTER TABLE "Announcement" RENAME COLUMN "versionName" TO "androidVersionName";

ALTER TABLE "Announcement" ALTER COLUMN "androidVersionCode" DROP NOT NULL;
ALTER TABLE "Announcement" ALTER COLUMN "androidVersionName" DROP NOT NULL;

ALTER TABLE "Announcement" ADD COLUMN "windowsVersionName" TEXT;

ALTER INDEX "Announcement_versionCode_key" RENAME TO "Announcement_androidVersionCode_key";

CREATE UNIQUE INDEX "Announcement_windowsVersionName_key" ON "Announcement"("windowsVersionName");
