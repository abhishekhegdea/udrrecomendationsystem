import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// Helper: resolve product's categoryId and sellerId given a productId.
// Returns null when the product no longer exists.
async function resolveProduct(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { categoryId: true, sellerId: true },
  });
  if (!product) return null;
  return {
    categoryId: product.categoryId,
    sellerId: product.sellerId,
  };
}

// POST track product view — writes to both ProductView (analytics) and UserBehaviour (ML personalization)
router.post('/view', async (req, res) => {
  try {
    const { userId, productId, timeSpent, scrollDepth, source } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }

    // Telemetry is best-effort: if the product no longer exists (stale link,
    // deleted listing) acknowledge the event without writing — ProductView.productId
    // is a required FK, so inserting would throw P2003 → 500.
    const resolved = await resolveProduct(productId);
    if (!resolved) {
      return res.status(200).json({ skipped: true, reason: 'product_not_found' });
    }

    const uid = userId || null;

    // 1. Create ProductView record (for analytics dashboard)
    const view = prisma.productView.create({
      data: {
        userId: uid,
        productId,
        timeSpent: timeSpent ? parseInt(timeSpent) : null,
        scrollDepth: scrollDepth ? parseInt(scrollDepth) : null,
      },
    });

    // 2. Create UserBehaviour record (for ML recommendation engine — category affinity, collab signals)
    //    Only for logged-in users (UserBehaviour.userId is a required FK)
    let behaviour: Promise<any> | null = null;
    if (uid) {
      behaviour = prisma.userBehaviour.create({
        data: {
          userId: uid,
          eventType: 'PRODUCT_VIEW',
          productId,
          categoryId: resolved.categoryId,
          sellerId: resolved.sellerId,
          source: source || 'product_details',
          metadata: {
            timeSpent: timeSpent ? parseInt(timeSpent) : null,
            scrollDepth: scrollDepth ? parseInt(scrollDepth) : null,
          },
        },
      });
    }

    const promises = behaviour ? [view, behaviour] : [view];
    const [createdView] = await Promise.all(promises);

    res.status(201).json(createdView);
  } catch (error) {
    // Close the TOCTOU race: if the product is deleted between the existence
    // check above and the insert, the FK still throws P2003 — treat it as a
    // skip rather than a 500.
    if ((error as any)?.code === 'P2003') {
      return res.status(200).json({ skipped: true, reason: 'product_not_found' });
    }
    console.error('Track view error:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
});

// POST track click — writes to both ClickEvent and UserBehaviour
router.post('/click', async (req, res) => {
  try {
    const { userId, productId, source, elementClicked } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }

    // Telemetry is best-effort: skip missing products (ClickEvent.productId is a required FK)
    const resolved = await resolveProduct(productId);
    if (!resolved) {
      return res.status(200).json({ skipped: true, reason: 'product_not_found' });
    }

    const uid = userId || null;

    // 1. Create ClickEvent record
    const click = prisma.clickEvent.create({
      data: {
        userId: uid,
        productId,
        source: source || 'unknown',
      },
    });

    // 2. Create UserBehaviour record (only for logged-in users)
    let behaviour: Promise<any> | null = null;
    if (uid) {
      behaviour = prisma.userBehaviour.create({
        data: {
          userId: uid,
          eventType: 'CLICK',
          productId,
          categoryId: resolved.categoryId,
          sellerId: resolved.sellerId,
          source: source || 'unknown',
          metadata: { elementClicked: elementClicked || null },
        },
      });
    }

    const promises = behaviour ? [click, behaviour] : [click];
    const [createdClick] = await Promise.all(promises);

    res.status(201).json(createdClick);
  } catch (error) {
    // Same TOCTOU hardening as /view — never 500 on a stale FK reference.
    if ((error as any)?.code === 'P2003') {
      return res.status(200).json({ skipped: true, reason: 'product_not_found' });
    }
    console.error('Track click error:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
});

// POST track search
router.post('/search', async (req, res) => {
  try {
    const { userId, query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }

    const search = await prisma.searchHistory.create({
      data: {
        userId: userId || null,
        query,
      },
    });

    // Also log to UserBehaviour for ML (fire-and-forget)
    if (userId) {
      prisma.userBehaviour.create({
        data: {
          userId,
          eventType: 'SEARCH',
          source: 'search_page',
          metadata: { query },
        },
      }).catch(() => {});
    }

    res.status(201).json(search);
  } catch (error) {
    console.error('Track search error:', error);
    res.status(500).json({ error: 'Failed to track search' });
  }
});

// POST generic behaviour event (backward compatibility)
router.post('/behaviour', async (req, res) => {
  try {
    const { userId, eventType, productId, source, metadata } = req.body;

    if (!userId || !eventType) {
      return res.status(400).json({ error: 'User ID and eventType required' });
    }

    // Resolve category/seller from product if provided; null out the product
    // reference when it no longer exists (UserBehaviour.productId is an FK)
    let resolvedProductId: string | null = productId || null;
    let categoryId: string | null = null;
    let sellerId: string | null = null;
    if (productId) {
      const resolved = await resolveProduct(productId);
      if (resolved) {
        categoryId = resolved.categoryId;
        sellerId = resolved.sellerId;
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
        source: source || null,
        metadata: metadata || {},
      },
    });

    res.status(201).json(behaviour);
  } catch (error) {
    console.error('Track behaviour error:', error);
    res.status(500).json({ error: 'Failed to track behaviour' });
  }
});

export default router;
