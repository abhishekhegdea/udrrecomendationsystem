-- Dynamic recommendation weights / Learning-to-Rank audit metadata.
-- Additive only: no existing RecommendationRun or score snapshot data is removed.

ALTER TABLE "RecommendationRun"
ADD COLUMN IF NOT EXISTS "userSegment" TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE "RecommendationRun"
ADD COLUMN IF NOT EXISTS "weightStrategy" TEXT NOT NULL DEFAULT 'static_weights';

ALTER TABLE "RecommendationRun"
ADD COLUMN IF NOT EXISTS "ltrModelVersion" TEXT;

ALTER TABLE "RecommendationRun"
ADD COLUMN IF NOT EXISTS "ltrBackend" TEXT;

CREATE INDEX IF NOT EXISTS "RecommendationRun_userSegment_createdAt_idx"
ON "RecommendationRun"("userSegment", "createdAt");
