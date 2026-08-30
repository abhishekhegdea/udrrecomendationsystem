# UdrCrafts — Precise Location-Based Recommendation Update

This update extends the existing city/state location boost into a precise distance-aware nearby-seller recommendation system.

## What is implemented

1. **Shopper coordinates** are captured with the browser Geolocation API after user permission.
2. Coordinates are sent to the Node backend with the logged-in JWT.
3. **Google Geocoding API** reverse-geocodes coordinates on the server. The Google key stays server-side.
4. `User` and `Seller` now store latitude, longitude, location accuracy, formatted address, and update timestamp.
5. Existing sellers can be bulk-geocoded from their city/state with `npm run geocode:sellers`.
6. Python finds sellers within **100 km** and injects nearby products into the candidate pool.
7. Distance is calculated using the Haversine formula locally, avoiding a paid Google call per recommendation candidate.
8. Location score uses a smooth decay: `score = exp(-distance_km / 25)`.
9. Up to **4 nearby products** are location-prioritized at the beginning of the final list, provided they still satisfy a minimum recommendation score.
10. City/state matching remains as fallback if exact seller coordinates do not exist.
11. API responses expose `seller_distance_km`, `location_score`, `nearby_seller`, and `location_priority_applied`.
12. Product cards display a `X km away` badge.
13. Recommendation audit snapshots persist distance and whether location-priority ranking was applied.

## Google Maps configuration

Enable **Geocoding API** in the Google Cloud project and configure billing.

Create a server-side API key and put it in:

`server/.env`

```env
GOOGLE_MAPS_API_KEY=YOUR_RESTRICTED_GOOGLE_MAPS_SERVER_KEY
```

Do **not** put this server key in a `VITE_*` environment variable or frontend source code.

For production, restrict the key to the Geocoding API and to the backend's permitted server IP addresses.

## Database update

From the project root, start PostgreSQL first:

```bash
cd /Users/garvitharan/Desktop/udrrecomendationsystem
docker compose up -d db redis
```

Then update Prisma:

```bash
cd /Users/garvitharan/Desktop/udrrecomendationsystem/server
npx prisma format
npx prisma db push
npx prisma generate
```

Do not run `prisma migrate reset` and do not delete Docker volumes.

The package also includes:

`server/prisma/migrations/20260829090000_add_precise_location_ranking/migration.sql`

for a migration-based workflow.

## Backfill existing sellers

Once `GOOGLE_MAPS_API_KEY` is configured:

```bash
cd /Users/garvitharan/Desktop/udrrecomendationsystem/server
npm run geocode:sellers
```

This uses seller city/state as a coarse initial coordinate. When a seller later grants precise browser location permission, the precise coordinates replace the coarse fallback.

## Start services

### Node

```bash
cd /Users/garvitharan/Desktop/udrrecomendationsystem/server
npm run dev
```

### Python

```bash
cd /Users/garvitharan/Desktop/udrrecomendationsystem/recommendation-system
source venv/bin/activate
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd /Users/garvitharan/Desktop/udrrecomendationsystem/frontend
npm run dev
```

## Verify coordinates in PostgreSQL

```bash
cd /Users/garvitharan/Desktop/udrrecomendationsystem

docker compose exec db psql -U udr -d udrcrafts -P pager=off -c '
SELECT id, "firstName", latitude, longitude, "locationAddress", "locationUpdatedAt"
FROM "User"
WHERE latitude IS NOT NULL
ORDER BY "locationUpdatedAt" DESC
LIMIT 10;
'
```

Seller verification:

```bash
docker compose exec db psql -U udr -d udrcrafts -P pager=off -c '
SELECT id, "businessName", latitude, longitude, "locationAddress", "locationUpdatedAt"
FROM "Seller"
WHERE latitude IS NOT NULL
ORDER BY "locationUpdatedAt" DESC NULLS LAST
LIMIT 20;
'
```

## Verify nearby sellers directly

Replace coordinates with the shopper coordinates:

```bash
curl -s "http://localhost:3001/api/locations/nearby-sellers?latitude=24.5854&longitude=73.7125&radiusKm=100&limit=20" | python3 -m json.tool
```

The endpoint intentionally does not expose sellers' exact stored coordinates in its response.

## Verify recommendation ranking

```bash
curl -s \
"http://127.0.0.1:8000/api/v1/recommendations/home/8c12f3c6-568e-4fdb-b961-c634a18c0199" \
| python3 -m json.tool
```

Each home recommendation can now include:

```json
{
  "location_score": 0.81,
  "seller_distance_km": 5.2,
  "nearby_seller": true,
  "location_priority_applied": true
}
```

## Inspect database recommendation audit

```bash
cd /Users/garvitharan/Desktop/udrrecomendationsystem

docker compose exec -T db psql -U udr -d udrcrafts \
< sql/LATEST_SCORE_QUERY.sql
```

The query now includes:

- `location_pct`
- `seller_distance_km`
- `nearby_seller`
- `location_priority_applied`
- final score

## Ranking behavior

The location feature remains part of the hybrid recommendation score. In addition, the ranker applies a bounded nearby-first rule:

- nearby radius: **100 km**
- distance decay: **25 km**
- nearby-first slots: **4**
- minimum final recommendation score for nearby-first promotion: **0.15**

This means distance matters strongly at the top of the list without allowing a completely irrelevant nearby product to replace every personalized recommendation.

## Important production note

For the current catalog size, Haversine distance is calculated in Python/Node after reading geocoded sellers. For a much larger seller network, move the spatial lookup into PostgreSQL/PostGIS with a `geography(Point, 4326)` column and a spatial index. The API and scoring fields can remain the same.
