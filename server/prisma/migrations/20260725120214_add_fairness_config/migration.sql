-- AlterTable
ALTER TABLE "UserBehaviour" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "FairnessConfig" (
    "id" SERIAL NOT NULL,
    "boost_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "new_seller_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "max_per_seller_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FairnessConfig_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserBehaviour" ADD CONSTRAINT "UserBehaviour_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBehaviour" ADD CONSTRAINT "UserBehaviour_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBehaviour" ADD CONSTRAINT "UserBehaviour_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
