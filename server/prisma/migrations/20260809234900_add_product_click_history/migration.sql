-- CreateTable
CREATE TABLE "ProductClickHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "productId" TEXT NOT NULL,
    "source" TEXT,
    "elementClicked" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductClickHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductClickHistory_productId_createdAt_idx"
ON "ProductClickHistory"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductClickHistory_createdAt_idx"
ON "ProductClickHistory"("createdAt");

-- CreateIndex
CREATE INDEX "ProductClickHistory_userId_createdAt_idx"
ON "ProductClickHistory"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductClickHistory"
ADD CONSTRAINT "ProductClickHistory_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductClickHistory"
ADD CONSTRAINT "ProductClickHistory_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;