-- Latest recommendation run: location calculation + final score audit
-- Replace the user id below if testing another shopper.
SELECT
    s.rank,
    LEFT(s."productId", 8) AS product_id,
    LEFT(s."productName", 45) AS product_name,
    ROUND(s."sellerDistanceKm"::numeric, 2) AS distance_km,
    ROUND((s."locationScore" * 100)::numeric, 2) AS location_score_pct,
    ROUND((s."locationWeight" * 100)::numeric, 2) AS location_weight_pct,
    ROUND((s."locationContribution" * 100)::numeric, 2) AS location_contribution_pct,
    s."nearbySeller" AS nearby,
    s."locationPriorityApplied" AS priority_applied,
    ROUND((s."weightedScoreBeforeRules" * 100)::numeric, 2) AS model_score_pct,
    ROUND((s."businessRuleAdjustment" * 100)::numeric, 2) AS rules_adjustment_pct,
    ROUND((s."finalScore" * 100)::numeric, 2) AS final_score_pct
FROM "RecommendationScoreSnapshot" s
WHERE s."runId" = (
    SELECT r.id
    FROM "RecommendationRun" r
    WHERE r."userId" = '8c12f3c6-568e-4fdb-b961-c634a18c0199'
    ORDER BY r."createdAt" DESC
    LIMIT 1
)
ORDER BY s.rank;
