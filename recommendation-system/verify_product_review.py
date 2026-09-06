"""
verify_product_review.py — Verification of Product Delivery Review & Rating System.
"""

import json
import urllib.request
import urllib.error
import sys

API_BASE = "http://localhost:3001/api"


def http_get(url):
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req) as response:
            return response.getcode(), json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode()) if e.headers.get_content_type() == 'application/json' else {}


def http_post(url, data):
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as response:
            return response.getcode(), json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode()) if e.headers.get_content_type() == 'application/json' else {}


def main():
    print("=" * 70)
    print("VERIFYING PRODUCT DELIVERY REVIEW & RATING SYSTEM")
    print("=" * 70)

    # 1. Fetch delivered orders or sample customer order
    print("\n[1] Finding active products...")
    code, res = http_get(f"{API_BASE}/products?limit=5")
    assert code == 200, f"Failed to fetch products: {res}"
    products = res.get("data", [])
    assert len(products) > 0, "No products found"

    sample_product = products[0]
    prod_id = sample_product["id"]
    prod_name = sample_product["name"]
    initial_rating = sample_product.get("averageRating", 0)
    initial_reviews = sample_product.get("reviewsCount", 0)

    print(f"  - Testing Product: {prod_name} (ID: {prod_id})")
    print(f"  - Initial Average Rating: {initial_rating} / 5.0 | Reviews Count: {initial_reviews}")

    # 2. Test Fetching Reviews Endpoint
    print("\n[2] Testing GET /api/products/:id/reviews...")
    code_rev, review_data = http_get(f"{API_BASE}/products/{prod_id}/reviews")
    assert code_rev == 200, f"Failed to fetch reviews: {review_data}"
    print(f"  - Reviews returned: {len(review_data.get('reviews', []))}")
    print(f"  - Star distribution: {review_data.get('distribution', {})}")

    # 3. Test Unauthorized/Non-Delivered Review Guard
    print("\n[3] Testing Verified Purchaser Guard...")
    fake_user_id = "00000000-0000-0000-0000-000000000000"
    code_unauth, res_unauth = http_post(
        f"{API_BASE}/products/{prod_id}/reviews",
        {"rating": 5, "text": "Test review", "userId": fake_user_id}
    )
    print(f"  - Non-delivered buyer submission HTTP status: {code_unauth} (Expected 403)")
    assert code_unauth == 403, f"Expected 403 Forbidden for non-buyer, got {code_unauth}"

    # 4. Test GET User Review Status
    print("\n[4] Testing GET /api/products/:id/user-review...")
    code_user_rev, user_rev_data = http_get(f"{API_BASE}/products/{prod_id}/user-review?userId={fake_user_id}")
    assert code_user_rev == 200
    print(f"  - User review status: {user_rev_data}")

    print("\n" + "=" * 70)
    print("ALL PRODUCT DELIVERY REVIEW & RATING CHECKS PASSED!")
    print("=" * 70)


if __name__ == "__main__":
    main()
