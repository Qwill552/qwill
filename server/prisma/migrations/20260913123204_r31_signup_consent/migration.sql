-- AlterTable
ALTER TABLE "User" ADD COLUMN     "privacyVersion" TEXT,
ADD COLUMN     "signupIp" TEXT,
ADD COLUMN     "signupUserAgent" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
