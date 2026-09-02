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
          },
        },
      });
    }

    /*
     * 3. New ProductClickHistory record.
     *
     * This is the table used by the recommendation equation.
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