from __future__ import annotations

import argparse
import json
import time
import urllib.request
import uuid

from datetime import datetime
from pathlib import Path
from typing import Dict, List

from app.database import SessionLocal

from app.models import (
    ClickEvent,
    UserBehaviour,
)


DEFAULT_API_BASE = (
    "http://127.0.0.1:8000"
)

DEFAULT_USER_ID = (
    "8c12f3c6-568e-4fdb-b961-c634a18c0199"
)

SYNTHETIC_SOURCE = (
    "ltr_synthetic_test"
)


# ============================================================
# API
# ============================================================

def generate_recommendation_run(
    user_id: str,
    api_base: str,
) -> Dict:

    url = (
        f"{api_base}"
        f"/api/v1/recommendations/home/"
        f"{user_id}"
    )

    print(
        "\nGenerating recommendation run:"
    )

    print(
        url
    )

    with urllib.request.urlopen(
        url,
        timeout=60,
    ) as response:

        payload = json.loads(
            response
            .read()
            .decode("utf-8")
        )

    if not payload.get(
        "score_snapshot_saved"
    ):

        raise RuntimeError(
            "Recommendation run was generated, "
            "but score snapshot was not saved. "
            f"Error: "
            f"{payload.get('score_snapshot_error')}"
        )

    return payload


# ============================================================
# EVENT HELPERS
# ============================================================

def create_click_event(
    db,
    *,
    user_id: str,
    product_id: str,
    run_id: str,
) -> None:

    now = datetime.utcnow()

    db.add(
        ClickEvent(
            id=str(
                uuid.uuid4()
            ),

            userId=user_id,

            productId=product_id,

            source=SYNTHETIC_SOURCE,

            createdAt=now,
        )
    )

    db.add(
        UserBehaviour(
            id=str(
                uuid.uuid4()
            ),

            userId=user_id,

            productId=product_id,

            eventType="CLICK",

            source=SYNTHETIC_SOURCE,

            eventMetadata={
                "synthetic_ltr_test":
                    True,

                "recommendation_run_id":
                    run_id,
            },

            createdAt=now,
        )
    )


def create_behaviour_event(
    db,
    *,
    user_id: str,
    product_id: str,
    event_type: str,
    run_id: str,
) -> None:

    db.add(
        UserBehaviour(
            id=str(
                uuid.uuid4()
            ),

            userId=user_id,

            productId=product_id,

            eventType=event_type,

            source=SYNTHETIC_SOURCE,

            eventMetadata={
                "synthetic_ltr_test":
                    True,

                "recommendation_run_id":
                    run_id,
            },

            createdAt=datetime.utcnow(),
        )
    )


# ============================================================
# LABEL GENERATION
# ============================================================

def generate_labels_for_run(
    *,
    user_id: str,
    run_id: str,
    recommendations: List[Dict],
) -> Dict[str, str]:

    if len(
        recommendations
    ) < 5:

        raise RuntimeError(
            "Need at least 5 recommended products "
            "to create a useful synthetic LTR group."
        )

    # --------------------------------------------------------
    # We deliberately create different relevance levels:
    #
    # Product 0 -> PURCHASE = 4
    # Product 1 -> CART     = 3
    # Product 2 -> WISHLIST = 2
    # Product 3 -> CLICK    = 1
    # Remaining -> no action = 0
    #
    # This gives LightGBM ranking variation such as:
    #
    # [4, 3, 2, 1, 0, 0, 0 ...]
    # --------------------------------------------------------

    purchase_product = (
        recommendations[0]
    )

    cart_product = (
        recommendations[1]
    )

    wishlist_product = (
        recommendations[2]
    )

    click_product = (
        recommendations[3]
    )

    db = SessionLocal()

    try:

        create_behaviour_event(
            db,

            user_id=user_id,

            product_id=
                purchase_product["id"],

            event_type=
                "PURCHASE",

            run_id=run_id,
        )

        create_behaviour_event(
            db,

            user_id=user_id,

            product_id=
                cart_product["id"],

            event_type=
                "CART",

            run_id=run_id,
        )

        create_behaviour_event(
            db,

            user_id=user_id,

            product_id=
                wishlist_product["id"],

            event_type=
                "WISHLIST",

            run_id=run_id,
        )

        create_click_event(
            db,

            user_id=user_id,

            product_id=
                click_product["id"],

            run_id=run_id,
        )

        db.commit()

    except Exception:

        db.rollback()

        raise

    finally:

        db.close()

    return {
        purchase_product["id"]:
            "PURCHASE",

        cart_product["id"]:
            "CART",

        wishlist_product["id"]:
            "WISHLIST",

        click_product["id"]:
            "CLICK",
    }


# ============================================================
# MAIN DATA GENERATION
# ============================================================

def generate_training_data(
    *,
    user_id: str,
    runs: int,
    api_base: str,
    sleep_seconds: float,
) -> List[Dict]:

    generated: List[Dict] = []

    for index in range(
        runs
    ):

        print(
            "\n"
            "============================================================"
        )

        print(
            f"LTR synthetic run "
            f"{index + 1}/{runs}"
        )

        print(
            "============================================================"
        )

        payload = (
            generate_recommendation_run(
                user_id,
                api_base,
            )
        )

        run_id = payload.get(
            "recommendation_run_id"
        )

        recommendations = (
            payload.get(
                "recommendations",
                [],
            )
        )

        if not run_id:

            raise RuntimeError(
                "API response does not contain "
                "recommendation_run_id."
            )

        print(
            f"Run ID: {run_id}"
        )

        print(
            "Candidate products:",
            len(
                recommendations
            ),
        )

        # Ensure downstream event timestamps are
        # strictly after recommendation generation.
        time.sleep(
            0.25
        )

        labels = (
            generate_labels_for_run(
                user_id=user_id,

                run_id=run_id,

                recommendations=
                    recommendations,
            )
        )

        generated.append(
            {
                "run_id":
                    run_id,

                "labels":
                    labels,
            }
        )

        print(
            "Synthetic outcomes:"
        )

        for (
            product_id,
            event_type,
        ) in labels.items():

            print(
                f"  {event_type:10s} "
                f"{product_id}"
            )

        if (
            index
            <
            runs - 1
        ):

            time.sleep(
                sleep_seconds
            )

    return generated


# ============================================================
# CLI
# ============================================================

def main() -> int:

    parser = (
        argparse.ArgumentParser(
            description=(
                "Generate synthetic downstream "
                "interaction data for testing "
                "the LTR pipeline."
            )
        )
    )

    parser.add_argument(
        "--user-id",

        default=
            DEFAULT_USER_ID,
    )

    parser.add_argument(
        "--runs",

        type=int,

        default=6,
    )

    parser.add_argument(
        "--api-base",

        default=
            DEFAULT_API_BASE,
    )

    parser.add_argument(
        "--sleep-seconds",

        type=float,

        default=0.5,
    )

    args = (
        parser.parse_args()
    )

    if args.runs < 1:

        raise ValueError(
            "--runs must be >= 1"
        )

    generated = (
        generate_training_data(
            user_id=
                args.user_id,

            runs=
                args.runs,

            api_base=
                args.api_base,

            sleep_seconds=
                args.sleep_seconds,
        )
    )

    print(
        "\n"
        "============================================================"
    )

    print(
        "LTR TEST DATA GENERATION COMPLETE"
    )

    print(
        "============================================================"
    )

    print(
        "Runs generated:",
        len(
            generated
        ),
    )

    print(
        "\nYou can now run:"
    )

    print(
        "\n"
        "python -m app.scripts.train_ltr_ranker "
        "--backend lightgbm "
        "--min-groups 5"
    )

    return 0


if __name__ == "__main__":

    raise SystemExit(
        main()
    )