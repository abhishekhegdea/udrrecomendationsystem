-- Return feedback + quality-return seller penalty.
--
-- Applied with `prisma migrate deploy` (not `migrate dev`): the dev
-- database is ahead of the migration history (columns like OrderItem.returned
-- and UserBehaviour.brandId were added via `prisma db push` in an earlier
-- session), so `migrate dev` would demand a destructive schema reset.
-- All statements are guarded with IF NOT EXISTS for safety.

-- Cumulative penalty for quality-issue returns (global score demotion).
ALTER TABLE "Seller"
  ADD COLUMN IF NOT EXISTS "returnPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Private feedback captured in the shopper return flow.
ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "returnReason" TEXT,
  ADD COLUMN IF NOT EXISTS "returnReviewText" TEXT,
  ADD COLUMN IF NOT EXISTS "returnRating" INTEGER;
