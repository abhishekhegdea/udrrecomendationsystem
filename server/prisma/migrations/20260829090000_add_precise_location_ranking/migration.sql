-- Precise shopper/seller coordinates for distance-aware recommendations.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "locationAccuracy" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "locationAddress" TEXT,
ADD COLUMN IF NOT EXISTS "locationUpdatedAt" TIMESTAMP(3);

ALTER TABLE "Seller"
ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "locationAccuracy" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "locationAddress" TEXT,
ADD COLUMN IF NOT EXISTS "locationUpdatedAt" TIMESTAMP(3);

-- Recommendation audit fields for precise location diagnostics.
ALTER TABLE "RecommendationScoreSnapshot"
ADD COLUMN IF NOT EXISTS "sellerDistanceKm" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "nearbySeller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "locationPriorityApplied" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "User_latitude_longitude_idx"
ON "User" ("latitude", "longitude");

CREATE INDEX IF NOT EXISTS "Seller_latitude_longitude_idx"
ON "Seller" ("latitude", "longitude");
