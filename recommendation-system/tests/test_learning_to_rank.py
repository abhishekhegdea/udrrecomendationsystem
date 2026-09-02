import json
import math

from pathlib import Path

from app.ml.learning_to_rank import (
    DynamicWeightResolver,
    LTR_FEATURE_KEYS,
    USER_SEGMENT_ACTIVE,
    USER_SEGMENT_NEW,
    USER_SEGMENT_RETURNING,
    UserActivityProfile,
    apply_segment_prior,
    blend_with_learned_importance,
    normalize_weights,
)


BASE = {
    "content": 0.12,
    "collaborative": 0.10,
    "trending": 0.08,
    "seasonal": 0.06,
    "location": 0.10,
    "category_affinity": 0.08,
    "brand_affinity": 0.07,
    "rating": 0.07,
    "seller_freshness": 0.05,
    "click_rate": 0.04,
    "user_click_affinity": 0.10,
    "engagement": 0.13,
}


def test_normalize_weights_sums_to_one():
    weights = normalize_weights(BASE)
    assert set(weights) == set(LTR_FEATURE_KEYS)
    assert math.isclose(sum(weights.values()), 1.0, rel_tol=1e-12)


def test_new_user_prior_reduces_personal_history_signals():
    weights = apply_segment_prior(BASE, USER_SEGMENT_NEW)
    assert weights["collaborative"] < BASE["collaborative"]
    assert weights["user_click_affinity"] < BASE["user_click_affinity"]
    assert weights["trending"] > BASE["trending"]
    assert math.isclose(sum(weights.values()), 1.0, rel_tol=1e-12)


def test_active_user_prior_increases_personalization():
    weights = apply_segment_prior(BASE, USER_SEGMENT_ACTIVE)
    assert weights["user_click_affinity"] > BASE["user_click_affinity"]
    assert weights["collaborative"] > BASE["collaborative"]
    assert math.isclose(sum(weights.values()), 1.0, rel_tol=1e-12)


def test_returning_user_prior_is_valid():
    weights = apply_segment_prior(BASE, USER_SEGMENT_RETURNING)
    assert all(value > 0.0 for value in weights.values())
    assert math.isclose(sum(weights.values()), 1.0, rel_tol=1e-12)


def test_learned_importance_changes_live_weights():
    prior = apply_segment_prior(BASE, USER_SEGMENT_ACTIVE)
    learned = {key: 0.01 for key in LTR_FEATURE_KEYS}
    learned["user_click_affinity"] = 0.50
    learned["engagement"] = 0.30

    weights = blend_with_learned_importance(
        prior,
        learned,
        learned_blend=0.65,
        min_feature_weight=0.01,
    )

    assert weights["user_click_affinity"] > prior["user_click_affinity"]
    assert math.isclose(sum(weights.values()), 1.0, rel_tol=1e-12)


def test_resolver_reads_segment_model_metadata(tmp_path, monkeypatch):
    segment_dir = tmp_path / USER_SEGMENT_ACTIVE
    segment_dir.mkdir(parents=True)

    importance = {key: 1.0 for key in LTR_FEATURE_KEYS}
    importance["location"] = 12.0

    (segment_dir / "metadata.json").write_text(
        json.dumps({
            "model_version": "lightgbm-active-test",
            "backend": "lightgbm",
            "feature_importance": importance,
        }),
        encoding="utf-8",
    )

    resolver = DynamicWeightResolver(
        model_dir=tmp_path,
        enabled=True,
    )

    profile = UserActivityProfile(
        segment=USER_SEGMENT_ACTIVE,
        lifetime_interactions=50,
        recent_interactions_7d=20,
        recent_interactions_30d=40,
        total_orders=2,
        last_activity_at=None,
    )

    monkeypatch.setattr(
        "app.ml.learning_to_rank.profile_user_activity",
        lambda db, user_id: profile,
    )

    context = resolver.resolve(
        db=object(),
        user_id="test-user",
        base_weights=BASE,
    )

    assert context.strategy == "ltr_feature_importance"
    assert context.ltr_backend == "lightgbm"
    assert context.ltr_model_version == "lightgbm-active-test"
    assert context.weights["location"] > apply_segment_prior(
        BASE,
        USER_SEGMENT_ACTIVE,
    )["location"]
    assert math.isclose(sum(context.weights.values()), 1.0, rel_tol=1e-12)
