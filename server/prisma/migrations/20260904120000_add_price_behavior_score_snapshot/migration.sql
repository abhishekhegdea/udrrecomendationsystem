-- Add price-behaviour audit columns to RecommendationScoreSnapshot.
--
-- priceBehaviorScore           effective price-behaviour match score (0..1)
-- priceBehaviorConfidence      user price-behaviour profile confidence (0..1)
-- priceBehaviorContribution    weighted contribution to the final score

ALTER TABLE "RecommendationScoreSnapshot"
  ADD COLUMN "priceBehaviorScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "priceBehaviorConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "priceBehaviorContribution" DOUBLE PRECISION NOT NULL DEFAULT 0;