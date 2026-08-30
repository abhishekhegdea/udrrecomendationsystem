-- Shopper locations
SELECT
    id,
    "firstName",
    latitude,
    longitude,
    "locationAddress",
    "locationUpdatedAt"
FROM "User"
WHERE latitude IS NOT NULL
ORDER BY "locationUpdatedAt" DESC NULLS LAST
LIMIT 20;

-- Seller locations
SELECT
    id,
    "businessName",
    latitude,
    longitude,
    "locationAddress",
    "locationUpdatedAt"
FROM "Seller"
WHERE latitude IS NOT NULL
ORDER BY "locationUpdatedAt" DESC NULLS LAST
LIMIT 30;

-- Latest location-aware recommendation audit
SELECT
    s.rank,
    LEFT(s."productId", 8) AS product_id,
    LEFT(s."productName", 50) AS product_name,
    ROUND((s."locationScore" * 100)::numeric, 2) AS location_pct,
    ROUND(s."sellerDistanceKm"::numeric, 2) AS seller_distance_km,
    s."nearbySeller" AS nearby_seller,
    s."locationPriorityApplied" AS priority_applied,
    ROUND((s."finalScore" * 100)::numeric, 2) AS final_score_pct
FROM "RecommendationScoreSnapshot" s
WHERE s."runId" = (
    SELECT id
    FROM "RecommendationRun"
    ORDER BY "createdAt" DESC
    LIMIT 1
)
ORDER BY s.rank;
