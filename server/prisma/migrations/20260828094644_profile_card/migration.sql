-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bioMode" TEXT NOT NULL DEFAULT 'text';

-- CreateTable
CREATE TABLE "ProfileCard" (
    "userId" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileCard_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ProfileCardImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileCardImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileCardImage_userId_idx" ON "ProfileCardImage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileCardImage_userId_name_key" ON "ProfileCardImage"("userId", "name");

-- AddForeignKey
ALTER TABLE "ProfileCard" ADD CONSTRAINT "ProfileCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileCardImage" ADD CONSTRAINT "ProfileCardImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
