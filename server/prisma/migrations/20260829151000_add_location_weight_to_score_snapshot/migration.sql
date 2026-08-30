-- Add the exact location weight used by each recommendation run to the
-- score snapshot. This is additive and does not reset or remove existing data.
ALTER TABLE "RecommendationScoreSnapshot"
ADD COLUMN IF NOT EXISTS "locationWeight" DOUBLE PRECISION NOT NULL DEFAULT 0;