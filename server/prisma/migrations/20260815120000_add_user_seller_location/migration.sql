-- Add cityId/stateId to User and Seller for location-based recommendations.
-- Uses IF NOT EXISTS guards since the dev DB may already have these columns
-- (added via prisma db push outside migration history).

-- 1. Add columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stateId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cityId" TEXT;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "stateId" TEXT;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "cityId" TEXT;

-- 2. FK constraints on User (guarded — PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_stateId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_stateId_fkey"
      FOREIGN KEY ("stateId") REFERENCES "State"("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_cityId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_cityId_fkey"
      FOREIGN KEY ("cityId") REFERENCES "City"("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

-- 3. FK constraints on Seller
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Seller_stateId_fkey'
  ) THEN
    ALTER TABLE "Seller"
      ADD CONSTRAINT "Seller_stateId_fkey"
      FOREIGN KEY ("stateId") REFERENCES "State"("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Seller_cityId_fkey'
  ) THEN
    ALTER TABLE "Seller"
      ADD CONSTRAINT "Seller_cityId_fkey"
      FOREIGN KEY ("cityId") REFERENCES "City"("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Indexes (these are likely missing from the live DB)
CREATE INDEX IF NOT EXISTS "User_stateId_idx" ON "User"("stateId");
CREATE INDEX IF NOT EXISTS "User_cityId_idx" ON "User"("cityId");
CREATE INDEX IF NOT EXISTS "Seller_stateId_idx" ON "Seller"("stateId");
CREATE INDEX IF NOT EXISTS "Seller_cityId_idx" ON "Seller"("cityId");
