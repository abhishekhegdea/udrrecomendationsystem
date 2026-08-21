SELECT
    s.rank,
    LEFT(s."productId", 8) AS product_id,
    LEFT(s."productName", 50) AS product_name,
    ROUND((s."contentScore" * 100)::numeric, 2) AS content_pct,
    ROUND((s."collaborativeScore" * 100)::numeric, 2) AS collaborative_pct,
    ROUND((s."trendingScore" * 100)::numeric, 2) AS trending_pct,
    ROUND((s."seasonalScore" * 100)::numeric, 2) AS seasonal_pct,
    ROUND((s."locationScore" * 100)::numeric, 2) AS location_pct,
    ROUND((s."categoryAffinityScore" * 100)::numeric, 2) AS category_pct,
    ROUND((s."brandAffinityScore" * 100)::numeric, 2) AS brand_pct,
    ROUND((s."ratingScore" * 100)::numeric, 2) AS rating_pct,
    ROUND((s."sellerFreshnessScore" * 100)::numeric, 2) AS seller_pct,
    ROUND((s."productClickPopularityScore" * 100)::numeric, 2) AS product_click_pct,
    ROUND((s."userClickAffinityScore" * 100)::numeric, 2) AS user_click_pct,
    ROUND((s."engagementScore" * 100)::numeric, 2) AS engagement_pct,
    ROUND((s."weightedScoreBeforeRules" * 100)::numeric, 2) AS before_rules_pct,
    ROUND((s."businessRuleAdjustment" * 100)::numeric, 2) AS rule_adjustment_pct,
    ROUND((s."finalScore" * 100)::numeric, 2) AS final_score_pct
FROM "RecommendationScoreSnapshot" s
WHERE s."runId" = (
    SELECT id
    FROM "RecommendationRun"
    WHERE "userId" = '8c12f3c6-568e-4fdb-b961-c634a18c0199'
    ORDER BY "createdAt" DESC
    LIMIT 1
)
ORDER BY s.rank;