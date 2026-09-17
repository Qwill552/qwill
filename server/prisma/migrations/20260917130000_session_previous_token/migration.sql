ALTER TABLE "Session" ADD COLUMN "previousTokenHash" TEXT;

CREATE INDEX "Session_previousTokenHash_idx" ON "Session"("previousTokenHash");
