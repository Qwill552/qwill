-- AlterTable
ALTER TABLE "File" ADD COLUMN     "uploadedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
