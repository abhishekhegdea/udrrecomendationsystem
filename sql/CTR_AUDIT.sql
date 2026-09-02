-- UdrCrafts true recommendation CTR audit
-- Window: latest 7 days
-- CTR = attributed recommendation clicks / visible recommendation impressions

WITH exposure AS (
    SELECT DISTINCT
        r.id AS run_id,
        r."userId" AS user_id,
        r.context,
        r."createdAt" AS impression_run_at,
        x.product_id,
        (x.product_id = ANY(r."clickedIds")) AS clicked
    FROM "RecommendationLog" r
    CROSS JOIN LATERAL
        unnest(r."recommendedIds") AS x(product_id)
    WHERE r."createdAt" >= NOW() - INTERVAL '7 days'
)
SELECT
    e.product_id,
    p.name AS product_name,
    COUNT(*) AS impressions_7d,
    COUNT(*) FILTER (WHERE e.clicked) AS clicks_7d,
    ROUND(
        COUNT(*) FILTER (WHERE e.clicked)::numeric
        / NULLIF(COUNT(*), 0),
        4
    ) AS raw_ctr,
    ROUND(
        100.0
        * COUNT(*) FILTER (WHERE e.clicked)::numeric
        / NULLIF(COUNT(*), 0),
        2
    ) AS raw_ctr_percent
FROM exposure e
LEFT JOIN "Product" p
    ON p.id = e.product_id
GROUP BY
    e.product_id,
    p.name
ORDER BY
    raw_ctr DESC NULLS LAST,
    impressions_7d DESC,
    clicks_7d DESC;

-- Latest exact recommendation exposure logs.
SELECT
    id AS recommendation_run_id,
    "userId",
    context,
    cardinality("recommendedIds") AS visible_impressions,
    cardinality("clickedIds") AS attributed_clicks,
    "recommendedIds",
    "clickedIds",
    "createdAt"
FROM "RecommendationLog"
ORDER BY "createdAt" DESC
LIMIT 20;
