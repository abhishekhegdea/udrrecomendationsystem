import math
import pytest
from app.ml.inventory_aware import (
    compute_inventory_fulfillment_score,
    get_inventory_status,
    get_inventory_explanation,
    apply_inventory_fulfillment_boost,
    STATUS_OUT_OF_STOCK,
    STATUS_LOW_STOCK,
    STATUS_IN_STOCK,
    STATUS_ABUNDANT,
)
from app.ml.recommendation_engine import (
    DEFAULT_WEIGHTS,
    DEFAULT_MIN_INVENTORY,
    ScoreBlender,
    BusinessRuleFilter,
    ScoredProduct,
    EngineConfig,
)
from app.ml.cold_start import (
    compute_cold_start_scores,
)


def test_inventory_fulfillment_curve():
    """Verify logarithmic fulfillment saturation curve."""
    # 0 or negative inventory must yield 0.0 score
    assert compute_inventory_fulfillment_score(0) == 0.0
    assert compute_inventory_fulfillment_score(-5) == 0.0
    assert compute_inventory_fulfillment_score(None) == 0.0

    # Positive inventories should be strictly increasing up to target
    score_1 = compute_inventory_fulfillment_score(1)
    score_3 = compute_inventory_fulfillment_score(3)
    score_5 = compute_inventory_fulfillment_score(5)
    score_10 = compute_inventory_fulfillment_score(10)
    score_50 = compute_inventory_fulfillment_score(50)

    assert 0.0 < score_1 < score_3 < score_5 < score_10
    assert math.isclose(score_10, 1.0, rel_tol=1e-4)
    assert math.isclose(score_50, 1.0, rel_tol=1e-4)
    assert score_50 <= 1.0


def test_inventory_status_and_explanations():
    """Verify status categories and descriptive explanations."""
    assert get_inventory_status(0) == STATUS_OUT_OF_STOCK
    assert get_inventory_status(-1) == STATUS_OUT_OF_STOCK
    assert get_inventory_status(None) == STATUS_OUT_OF_STOCK
    assert get_inventory_status(1) == STATUS_LOW_STOCK
    assert get_inventory_status(2) == STATUS_LOW_STOCK
    assert get_inventory_status(3) == STATUS_IN_STOCK
    assert get_inventory_status(9) == STATUS_IN_STOCK
    assert get_inventory_status(10) == STATUS_ABUNDANT
    assert get_inventory_status(100) == STATUS_ABUNDANT

    assert "out of stock" in get_inventory_explanation(0).lower()
    assert "Only 1 left in stock" in get_inventory_explanation(1)
    assert "Only 2 left in stock" in get_inventory_explanation(2)
    assert "7 units available" in get_inventory_explanation(7)
    assert "10 units available" in get_inventory_explanation(10)


def test_apply_inventory_fulfillment_boost():
    """Verify inventory boost calculation on base scores."""
    assert apply_inventory_fulfillment_boost(0.8, 0) == 0.0
    assert apply_inventory_fulfillment_boost(0.8, -3) == 0.0

    boosted_1 = apply_inventory_fulfillment_boost(0.8, 1, weight=0.15)
    boosted_10 = apply_inventory_fulfillment_boost(0.8, 10, weight=0.15)
    assert boosted_10 > boosted_1 > 0.0


def test_default_weights_balance_and_inventory_key():
    """Ensure DEFAULT_WEIGHTS includes inventory and sums to exactly 1.0."""
    assert "inventory" in DEFAULT_WEIGHTS
    assert DEFAULT_WEIGHTS["inventory"] > 0
    total_weights = sum(DEFAULT_WEIGHTS.values())
    assert math.isclose(total_weights, 1.0, rel_tol=1e-4)


def test_score_blender_zeroes_out_of_stock():
    """Verify that ScoreBlender forces final_score to 0.0 when inventory is 0 or negative."""
    class MockProduct:
        def __init__(self, id, inventory):
            self.id = id
            self.inventory = inventory

    p_in_stock = MockProduct("p1", inventory=10)
    p_out_stock = MockProduct("p2", inventory=0)

    sp_in_stock = ScoredProduct(
        product=p_in_stock,
        content_score=0.9,
        collab_score=0.8,
        trend_score=0.7,
        rating_score=0.9,
        inventory_score=compute_inventory_fulfillment_score(10),
        inventory_units=10,
    )
    sp_out_stock = ScoredProduct(
        product=p_out_stock,
        content_score=0.9,
        collab_score=0.8,
        trend_score=0.7,
        rating_score=0.9,
        inventory_score=0.0,
        inventory_units=0,
    )

    blender = ScoreBlender(DEFAULT_WEIGHTS)
    blended_list = blender.blend([sp_in_stock, sp_out_stock])

    assert blended_list[0].final_score > 0.0
    assert blended_list[1].final_score == 0.0


def test_business_rule_filter_removes_unavailable_items():
    """BusinessRuleFilter must discard items with inventory < min_inventory."""
    class MockProduct:
        def __init__(self, id, inventory, price=100.0, avg_rating=4.5, seller_id="s1"):
            self.id = id
            self.inventory = inventory
            self.price = price
            self.averageRating = avg_rating
            self.reviewsCount = 10
            self.sellerId = seller_id
            self.seller = None
            self.categoryId = "c1"
            self.isNewSeller = False
            self.rating = 4.5
            self.isCraftsman = True

    p_available_high = MockProduct("p1", inventory=10, seller_id="s1")
    p_available_low = MockProduct("p2", inventory=1, seller_id="s2")
    p_available_low.categoryId = "c2"
    p_out_of_stock = MockProduct("p3", inventory=0, seller_id="s3")
    p_negative_stock = MockProduct("p4", inventory=-2, seller_id="s4")

    scored_products = [
        ScoredProduct(product=p_available_high, final_score=0.9, inventory_units=10),
        ScoredProduct(product=p_available_low, final_score=0.7, inventory_units=1),
        ScoredProduct(product=p_out_of_stock, final_score=0.0, inventory_units=0),
        ScoredProduct(product=p_negative_stock, final_score=0.0, inventory_units=-2),
    ]

    config = EngineConfig(min_inventory=1)
    filter_instance = BusinessRuleFilter(db=None, config=config)
    filtered = filter_instance.apply(scored_products, user_id="test_user")

    filtered_ids = [sp.product.id for sp in filtered]
    assert "p1" in filtered_ids
    assert "p2" in filtered_ids
    assert "p3" not in filtered_ids
    assert "p4" not in filtered_ids


def test_cold_start_inventory_scoring():
    """Verify that cold start scoring zeroes out out of stock items."""
    class MockProduct:
        def __init__(self, id, inventory, popularity=10.0, avg_rating=4.8, reviews_count=15):
            self.id = id
            self.inventory = inventory
            self.popularity = popularity
            self.averageRating = avg_rating
            self.reviewsCount = reviews_count
            self.sellerId = "s1"
            self.categoryId = "c1"
            self.name = "Handcrafted Ceramic Mug"
            self.description = "Artisan crafted"
            self.craftType = "Pottery"
            self.tags = ["artisan"]
            self.seller = None

    p_in_stock = MockProduct("p1", inventory=8)
    p_out_of_stock = MockProduct("p2", inventory=0)

    scores = compute_cold_start_scores(
        candidates=[p_in_stock, p_out_of_stock],
        db=None,
        config=EngineConfig(),
    )

    assert "p1" in scores
    assert "p2" in scores
    assert scores["p1"].cold_start_score > 0.0
    assert scores["p2"].cold_start_score == 0.0
