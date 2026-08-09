-- AlterTable
ALTER TABLE "DeliveryPartner" ADD COLUMN     "aadhaarNumber" TEXT,
ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "drivingLicense" TEXT,
ADD COLUMN     "ifscCode" TEXT,
ADD COLUMN     "panNumber" TEXT,
ADD COLUMN     "rcBook" TEXT,
ADD COLUMN     "upiId" TEXT,
ADD COLUMN     "vehicleInsurance" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryPartnerId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "etsyUrl" TEXT,
ADD COLUMN     "reviewsCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Seller" ADD COLUMN     "aadhaarNumber" TEXT,
ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "documents" TEXT[],
ADD COLUMN     "ifscCode" TEXT,
ADD COLUMN     "panNumber" TEXT,
ADD COLUMN     "upiId" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryPartnerId_fkey" FOREIGN KEY ("deliveryPartnerId") REFERENCES "DeliveryPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
