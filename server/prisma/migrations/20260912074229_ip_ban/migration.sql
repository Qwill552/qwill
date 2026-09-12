-- CreateTable
CREATE TABLE "IpBan" (
    "id" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdByUsername" TEXT,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    "liftedByUsername" TEXT,

    CONSTRAINT "IpBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IpBan_cidr_key" ON "IpBan"("cidr");

-- CreateIndex
CREATE INDEX "IpBan_expiresAt_idx" ON "IpBan"("expiresAt");
