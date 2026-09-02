import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// Only genuine product-discovery clicks should contribute to the
// recommendation click-rate metric.
//
// We intentionally DO NOT count "add_to_cart_button" here because CART
// already has its own recommendation signal. Counting the same action
// as both CART and click-rate would reward the same action twice.
const CLICK_RATE_ELEMENTS = new Set([
  'product_card',
  'quick_view_button',
]);

async function resolveProduct(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      categoryId: true,
      sellerId: true,
      brandId: true,
    },
  });

  if (!product) {
    return null;
  }

  return {
    categoryId: product.categoryId,
    sellerId: product.sellerId,
    brandId: product.brandId,
  };
}


// -------------------------------------------------------------------------
// TRUE RECOMMENDATION CTR ATTRIBUTION
// -------------------------------------------------------------------------
//
// RecommendationLog is used as one compact row per RecommendationRun:
//
//   recommendedIds = products that were actually visible to the shopper
//   clickedIds     = visible recommended products that were clicked
//
// Using the RecommendationRun UUID as RecommendationLog.id gives us exact
// run-level attribution without changing the existing database schema.
//
// A click is allowed to count toward CTR only when the product really existed
// in the persisted RecommendationScoreSnapshot for that user + run.

async function validateRecommendationExposure(
  recommendationRunId: string,
  userId: string,
  productId: string,
) {
  const snapshot = await prisma.recommendationScoreSnapshot.findFirst({
    where: {
      runId: recommendationRunId,
      userId,
      productId,
    },
    select: {
      rank: true,
    },
  });

  if (!snapshot) {
    return null;
  }

  const run = await prisma.recommendationRun.findUnique({
    where: {
      id: recommendationRunId,
    },
    select: {
      userId: true,
      context: true,
    },
  });

  if (!run || run.userId !== userId) {
    return null;
  }

  return {
    context: run.context || 'home',
    rank: snapshot.rank,
  };
}

async function recordRecommendationImpression(
  recommendationRunId: string,
  userId: string,
  productId: string,
  context?: string,
) {
  const valid = await validateRecommendationExposure(
    recommendationRunId,
    userId,
    productId,
  );

  if (!valid) {
    return false;
  }

  const resolvedContext = context || valid.context || 'home';

  await prisma.recommendationLog.upsert({
    where: {
      id: recommendationRunId,
    },
    create: {
      id: recommendationRunId,
      userId,
      recommendedIds: [productId],
      clickedIds: [],
      context: resolvedContext,
    },
    update: {
      context: resolvedContext,
    },
  });

  // Idempotent append. Re-renders / repeated IntersectionObserver callbacks do
  // not create additional impressions for the same product in the same run.
  await prisma.$executeRaw`
    UPDATE "RecommendationLog"
    SET "recommendedIds" = CASE
      WHEN ${productId} = ANY("recommendedIds")
        THEN "recommendedIds"
      ELSE array_append("recommendedIds", ${productId})
    END
    WHERE "id" = ${recommendationRunId}
      AND "userId" = ${userId}
  `;

  return true;
}

async function recordRecommendationCtrClick(
  recommendationRunId: string,
  userId: string,
  productId: string,
  context?: string,
) {
  const valid = await validateRecommendationExposure(
    recommendationRunId,
    userId,
    productId,
  );

  if (!valid) {
    return false;
  }

  const resolvedContext = context || valid.context || 'home';

  // A click logically implies that the product was visible. Therefore create
  // both arrays when the impression request and the click request race.
  await prisma.recommendationLog.upsert({
    where: {
      id: recommendationRunId,
    },
    create: {
      id: recommendationRunId,
      userId,
      recommendedIds: [productId],
      clickedIds: [productId],
      context: resolvedContext,
    },
    update: {
      context: resolvedContext,
    },
  });

  // Keep numerator and denominator idempotent at run-product level.
  await prisma.$executeRaw`
    UPDATE "RecommendationLog"
    SET
      "recommendedIds" = CASE
        WHEN ${productId} = ANY("recommendedIds")
          THEN "recommendedIds"
        ELSE array_append("recommendedIds", ${productId})
      END,
      "clickedIds" = CASE
        WHEN ${productId} = ANY("clickedIds")
          THEN "clickedIds"
        ELSE array_append("clickedIds", ${productId})
      END
    WHERE "id" = ${recommendationRunId}
      AND "userId" = ${userId}
  `;

  return true;
}

// -------------------------------------------------------------------------
// RECOMMENDATION IMPRESSION
// -------------------------------------------------------------------------

router.post('/recommendation-impression', async (req, res) => {
  try {
    const {
      userId,
      productId,
      recommendationRunId,
      context,
    } = req.body;

    if (!userId || !productId || !recommendationRunId) {
      return res.status(400).json({
        error: 'userId, productId and recommendationRunId are required',
      });
    }

    const recorded = await recordRecommendationImpression(
      String(recommendationRunId),
      String(userId),
      String(productId),
      typeof context === 'string' ? context : undefined,
    );

    if (!recorded) {
      return res.status(200).json({
        skipped: true,
        reason: 'invalid_recommendation_attribution',
      });
    }

    return res.status(201).json({
      recorded: true,
      recommendationRunId,
      productId,
    });
  } catch (error) {
    console.error('Track recommendation impression error:', error);

    return res.status(500).json({
      error: 'Failed to track recommendation impression',
    });
  }
});

// -------------------------------------------------------------------------
// PRODUCT VIEW
// -------------------------------------------------------------------------

router.post('/view', async (req, res) => {
  try {
    const {
      userId,
      productId,
      timeSpent,
      scrollDepth,
      source,
    } = req.body;

    if (!productId) {
      return res.status(400).json({
        error: 'Product ID required',
      });
    }

    const resolved = await resolveProduct(productId);

    if (!resolved) {
      return res.status(200).json({
        skipped: true,
        reason: 'product_not_found',
      });
    }

    const uid = userId || null;

    const view = prisma.productView.create({
      data: {
        userId: uid,
        productId,
        categoryId: resolved.categoryId,
        timeSpent:
          timeSpent !== undefined && timeSpent !== null
            ? parseInt(timeSpent)
            : null,
        scrollDepth:
          scrollDepth !== undefined && scrollDepth !== null
            ? parseInt(scrollDepth)
            : null,
      },
    });

    let behaviour: Promise<any> | null = null;

    if (uid) {
      behaviour = prisma.userBehaviour.create({
        data: {
          userId: uid,
          eventType: 'PRODUCT_VIEW',
          productId,
          categoryId: resolved.categoryId,
          sellerId: resolved.sellerId,
          brandId: resolved.brandId,
          source: source || 'product_details',
          metadata: {
            timeSpent:
              timeSpent !== undefined && timeSpent !== null
                ? parseInt(timeSpent)
                : null,
            scrollDepth:
              scrollDepth !== undefined && scrollDepth !== null
                ? parseInt(scrollDepth)
                : null,
          },
        },
      });
    }

    const promises: Promise<any>[] = [view];

    if (behaviour) {
      promises.push(behaviour);
    }

    const [createdView] = await Promise.all(promises);

    return res.status(201).json(createdView);
  } catch (error) {
    if ((error as any)?.code === 'P2003') {
      return res.status(200).json({
        skipped: true,
        reason: 'product_not_found',
      });
    }

    console.error('Track view error:', error);

    return res.status(500).json({
      error: 'Failed to track view',
    });
  }
});

// -------------------------------------------------------------------------
// PRODUCT CLICK
// -------------------------------------------------------------------------

router.post('/click', async (req, res) => {
  try {
    const {
      userId,
      productId,
      source,
      elementClicked,
      recommendationRunId,
      recommendationContext,
    } = req.body;

    if (!productId) {
      return res.status(400).json({
        error: 'Product ID required',
      });
    }

    const resolved = await resolveProduct(productId);

    if (!resolved) {
      return res.status(200).json({
        skipped: true,
        reason: 'product_not_found',
      });
    }

    const uid = userId || null;

    /*
     * 1. Existing analytics click.
     *
     * Keep this because ClickEvent can still be useful for analytics and
     * historical reporting.
     */
    const click = prisma.clickEvent.create({
      data: {
        userId: uid,
        productId,
        categoryId: resolved.categoryId,
        brandId: resolved.brandId,
        source: source || 'unknown',
      },
    });

    /*
     * 2. Existing UserBehaviour click.
     *
     * Only logged-in users can have UserBehaviour because userId is
     * required there.
     */
    let behaviour: Promise<any> | null = null;

    if (uid) {
      behaviour = prisma.userBehaviour.create({
        data: {
          userId: uid,
          eventType: 'CLICK',
          productId,
          categoryId: resolved.categoryId,
          sellerId: resolved.sellerId,
          brandId: resolved.brandId,
          source: source || 'unknown',
          metadata: {
            elementClicked: elementClicked || null,
            recommendationRunId: recommendationRunId || null,
          },
        },
      });
    }

    /*
     * 3. Existing ProductClickHistory record.
     *
     * Retained for short-lived click analytics and backwards compatibility.
     * True recommendation CTR is now calculated from RecommendationLog, where
     * we have both visible impressions and attributed clicks.
     *
     * We only insert when the user is actually discovering/opening a
     * product. Clicking Add to Cart is deliberately not counted here.
     */
    const shouldCountForClickRate =
      CLICK_RATE_ELEMENTS.has(elementClicked || '');

    const clickRateHistory = shouldCountForClickRate
      ? prisma.productClickHistory.create({
          data: {
            userId: uid,
            productId,
            categoryId: resolved.categoryId,
            source: source || 'unknown',
            elementClicked: elementClicked || null,
          },
        })
      : null;

    const promises: Promise<any>[] = [click];

    if (behaviour) {
      promises.push(behaviour);
    }

    if (clickRateHistory) {
      promises.push(clickRateHistory);
    }

    const [createdClick] = await Promise.all(promises);

    // True CTR numerator. Only genuine discovery clicks from a validated
    // recommendation run are counted. This is intentionally separate from
    // Cart/Wishlist/Purchase signals.
    if (
      shouldCountForClickRate &&
      uid &&
      recommendationRunId
    ) {
      try {
        await recordRecommendationCtrClick(
          String(recommendationRunId),
          String(uid),
          String(productId),
          typeof recommendationContext === 'string'
            ? recommendationContext
            : undefined,
        );
      } catch (ctrError) {
        // Analytics must never break the user's click/navigation.
        console.warn(
          'Recommendation CTR attribution failed:',
          ctrError,
        );
      }
    }

    return res.status(201).json(createdClick);
  } catch (error) {
    if ((error as any)?.code === 'P2003') {
      return res.status(200).json({
        skipped: true,
        reason: 'product_not_found',
      });
    }

    console.error('Track click error:', error);

    return res.status(500).json({
      error: 'Failed to track click',
    });
  }
});

// -------------------------------------------------------------------------
// SEARCH
// -------------------------------------------------------------------------

router.post('/search', async (req, res) => {
  try {
    const {
      userId,
      query,
    } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Query required',
      });
    }

    const search = await prisma.searchHistory.create({
      data: {
        userId: userId || null,
        query,
      },
    });

    if (userId) {
      prisma.userBehaviour.create({
        data: {
          userId,
          eventType: 'SEARCH',
          source: 'search_page',
          metadata: {
            query,
          },
        },
      }).catch(() => {});
    }

    return res.status(201).json(search);
  } catch (error) {
    console.error('Track search error:', error);

    return res.status(500).json({
      error: 'Failed to track search',
    });
  }
});

// -------------------------------------------------------------------------
// GENERIC USER BEHAVIOUR
// -------------------------------------------------------------------------

router.post('/behaviour', async (req, res) => {
  try {
    const {
      userId,
      eventType,
      productId,
      source,
      metadata,
    } = req.body;

    if (!userId || !eventType) {
      return res.status(400).json({
        error: 'User ID and eventType required',
      });
    }

    let resolvedProductId: string | null = productId || null;
    let categoryId: string | null = null;
    let sellerId: string | null = null;
    let brandId: string | null = null;

    if (productId) {
      const resolved = await resolveProduct(productId);

      if (resolved) {
        categoryId = resolved.categoryId;
        sellerId = resolved.sellerId;
        brandId = resolved.brandId;
      } else {
        resolvedProductId = null;
      }
    }

    const behaviour = await prisma.userBehaviour.create({
      data: {
        userId,
        eventType,
        productId: resolvedProductId,
        categoryId,
        sellerId,
        brandId,
        source: source || null,
        metadata: metadata || {},
      },
    });

    return res.status(201).json(behaviour);
  } catch (error) {
    console.error('Track behaviour error:', error);

    return res.status(500).json({
      error: 'Failed to track behaviour',
    });
  }
});

export default router;