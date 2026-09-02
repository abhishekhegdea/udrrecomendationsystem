SELECT
    s.rank,
    LEFT(s."productId", 8) AS product_id,
    LEFT(s."productName", 50) AS product_name,

    r."userSegment" AS user_segment,
    r."weightStrategy" AS weight_strategy,
    r."ltrBackend" AS ltr_backend,
    r."ltrModelVersion" AS ltr_model_version,

    ROUND(((r.weights->>'content')::numeric * 100), 2) AS content_weight_pct,
    ROUND(((r.weights->>'collaborative')::numeric * 100), 2) AS collaborative_weight_pct,
    ROUND(((r.weights->>'trending')::numeric * 100), 2) AS trending_weight_pct,
    ROUND(((r.weights->>'seasonal')::numeric * 100), 2) AS seasonal_weight_pct,
    ROUND(((r.weights->>'location')::numeric * 100), 2) AS location_weight_pct,
    ROUND(((r.weights->>'category_affinity')::numeric * 100), 2) AS category_weight_pct,
    ROUND(((r.weights->>'brand_affinity')::numeric * 100), 2) AS brand_weight_pct,
    ROUND(((r.weights->>'rating')::numeric * 100), 2) AS rating_weight_pct,
    ROUND(((r.weights->>'seller_freshness')::numeric * 100), 2) AS seller_weight_pct,
    ROUND(((r.weights->>'click_rate')::numeric * 100), 2) AS click_popularity_weight_pct,
    ROUND(((r.weights->>'user_click_affinity')::numeric * 100), 2) AS user_click_affinity_weight_pct,
    ROUND(((r.weights->>'engagement')::numeric * 100), 2) AS engagement_weight_pct,

    ROUND((s."contentScore" * 100)::numeric, 2) AS content_pct,
    ROUND((s."collaborativeScore" * 100)::numeric, 2) AS collaborative_pct,
    ROUND((s."trendingScore" * 100)::numeric, 2) AS trending_pct,
    ROUND((s."seasonalScore" * 100)::numeric, 2) AS seasonal_pct,
    ROUND((s."locationScore" * 100)::numeric, 2) AS location_score_pct,
    ROUND((s."locationWeight" * 100)::numeric, 2) AS snapshot_location_weight_pct,
    ROUND((s."locationContribution" * 100)::numeric, 2) AS location_contribution_pct,
    ROUND(s."sellerDistanceKm"::numeric, 2) AS seller_distance_km,
    s."nearbySeller" AS nearby_seller,
    s."locationPriorityApplied" AS location_priority_applied,
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
JOIN "RecommendationRun" r
  ON r.id = s."runId"

WHERE s."runId" = (
    SELECT id
    FROM "RecommendationRun"
    WHERE "userId" = '8c12f3c6-568e-4fdb-b961-c634a18c0199'
    ORDER BY "createdAt" DESC
    LIMIT 1
)
ORDER BY s.rank;
