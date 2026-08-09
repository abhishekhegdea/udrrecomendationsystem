-- Expose the SellerScore table from Prisma (already created by the init migration)
-- Add cancellation tracking fields to OrderItem

ALTER TABLE "OrderItem" 
  ADD COLUMN IF NOT EXISTS "cancelled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;

-- Add cancel penalty to Seller
ALTER TABLE "Seller"
  ADD COLUMN IF NOT EXISTS "cancelPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0;