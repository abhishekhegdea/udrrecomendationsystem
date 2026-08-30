-- ============================================================
-- DYNAMIC WEIGHT / LEARNING-TO-RANK AUDIT
-- Latest home recommendation run for the test user.
-- ============================================================

WITH latest_run AS (
    SELECT *
    FROM "RecommendationRun"
    WHERE "userId" = '8c12f3c6-568e-4fdb-b961-c634a18c0199'
    ORDER BY "createdAt" DESC
    LIMIT 1
)
SELECT
    id AS run_id,
    "createdAt" AS created_at,
    "algorithmVersion" AS algorithm_version,
    "userSegment" AS user_segment,
    "weightStrategy" AS weight_strategy,
    "ltrBackend" AS ltr_backend,
    "ltrModelVersion" AS ltr_model_version,

    ROUND(((weights->>'content')::numeric * 100), 2) AS content_weight_pct,
    ROUND(((weights->>'collaborative')::numeric * 100), 2) AS collaborative_weight_pct,
    ROUND(((weights->>'trending')::numeric * 100), 2) AS trending_weight_pct,
    ROUND(((weights->>'seasonal')::numeric * 100), 2) AS seasonal_weight_pct,
    ROUND(((weights->>'location')::numeric * 100), 2) AS location_weight_pct,
    ROUND(((weights->>'category_affinity')::numeric * 100), 2) AS category_weight_pct,
    ROUND(((weights->>'brand_affinity')::numeric * 100), 2) AS brand_weight_pct,
    ROUND(((weights->>'rating')::numeric * 100), 2) AS rating_weight_pct,
    ROUND(((weights->>'seller_freshness')::numeric * 100), 2) AS seller_weight_pct,
    ROUND(((weights->>'click_rate')::numeric * 100), 2) AS click_popularity_weight_pct,
    ROUND(((weights->>'user_click_affinity')::numeric * 100), 2) AS user_click_affinity_weight_pct,
    ROUND(((weights->>'engagement')::numeric * 100), 2) AS engagement_weight_pct,

    ROUND((
        (weights->>'content')::numeric
        + (weights->>'collaborative')::numeric
        + (weights->>'trending')::numeric
        + (weights->>'seasonal')::numeric
        + (weights->>'location')::numeric
        + (weights->>'category_affinity')::numeric
        + (weights->>'brand_affinity')::numeric
        + (weights->>'rating')::numeric
        + (weights->>'seller_freshness')::numeric
        + (weights->>'click_rate')::numeric
        + (weights->>'user_click_affinity')::numeric
        + (weights->>'engagement')::numeric
    ), 8) AS weight_sum
FROM latest_run;


-- Per-product proof that the persisted contributions use the exact dynamic
-- weights from the parent RecommendationRun.
WITH latest_run AS (
    SELECT *
    FROM "RecommendationRun"
    WHERE "userId" = '8c12f3c6-568e-4fdb-b961-c634a18c0199'
    ORDER BY "createdAt" DESC
    LIMIT 1
)
SELECT
    s.rank,
    LEFT(s."productName", 45) AS product,

    ROUND((s."contentContribution" * 100)::numeric, 2) AS content_contrib_pct,
    ROUND((s."collaborativeContribution" * 100)::numeric, 2) AS collab_contrib_pct,
    ROUND((s."locationContribution" * 100)::numeric, 2) AS location_contrib_pct,
    ROUND((s."userClickAffinityContribution" * 100)::numeric, 2) AS user_click_contrib_pct,
    ROUND((s."engagementContribution" * 100)::numeric, 2) AS engagement_contrib_pct,

    ROUND((s."weightedScoreBeforeRules" * 100)::numeric, 2) AS model_score_pct,
    ROUND((s."businessRuleAdjustment" * 100)::numeric, 2) AS rules_adjustment_pct,
    ROUND((s."finalScore" * 100)::numeric, 2) AS final_score_pct

FROM "RecommendationScoreSnapshot" s
JOIN latest_run r
  ON r.id = s."runId"
ORDER BY s.rank;
