import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// GET Seller Dashboard Stats & Orders
router.get('/stats/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;

    // Check if sellerId exists in Seller table or User table
    let resolvedSellerId = sellerId;
    let seller = await prisma.seller.findUnique({
      where: { id: sellerId }
    });

    if (!seller) {
      // Check if sellerId is a User.id whose email matches a Seller
      const user = await prisma.user.findUnique({ where: { id: sellerId } });
      if (user) {
        const matchingSeller = await prisma.seller.findUnique({ where: { email: user.email } });
        if (matchingSeller) {
          seller = matchingSeller;
          resolvedSellerId = matchingSeller.id;
        }
      }
    }

    // Collect all matching seller IDs for this artisan (including any demo/artisan test accounts)
    const sellerIds = [resolvedSellerId];
    if (seller?.email === 'seller@gmail.com' || seller?.email === 'delivery@gmail.com' || seller?.email === 'abhishekhegdea@gmail.com') {
      const demoSellers = await prisma.seller.findMany({
        where: { email: { in: ['seller@gmail.com', 'delivery@gmail.com', 'abhishekhegdea@gmail.com'] } },
        select: { id: true }
      });
      demoSellers.forEach(s => {
        if (!sellerIds.includes(s.id)) sellerIds.push(s.id);
      });
    }

    const activeListings = await prisma.product.count({
      where: { sellerId: { in: sellerIds } }
    });

    // Get products for this seller
    const sellerProducts = await prisma.product.findMany({
      where: { sellerId: { in: sellerIds } },
      select: { id: true, name: true, images: true, averageRating: true, reviewsCount: true }
    });
    const sellerProductIds = sellerProducts.map(p => p.id);

    // Get order items for this seller's products (exclude cancelled items)
    const orderItems = await prisma.orderItem.findMany({
      where: { 
        product: { sellerId: { in: sellerIds } },
        cancelled: false  // Only non-cancelled items
      },
      include: {
        order: { select: { id: true, createdAt: true, status: true, user: { select: { firstName: true, lastName: true, email: true } } } },
        product: { select: { id: true, name: true, images: true, price: true } }
      },
      orderBy: { order: { createdAt: 'desc' } }
    });

    // Also get cancelled items separately for display
    const cancelledItems = await prisma.orderItem.findMany({
      where: { 
        product: { sellerId: { in: sellerIds } },
        cancelled: true
      },
      include: {
        order: { select: { id: true, createdAt: true, status: true, user: { select: { firstName: true, lastName: true, email: true } } } },
        product: { select: { id: true, name: true, images: true, price: true } }
      },
      orderBy: { cancelledAt: 'desc' },
      take: 20,
    });

    // Get customer reviews on all products of this seller
    const reviews = await prisma.review.findMany({
      where: {
        productId: { in: sellerProductIds }
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        product: { select: { id: true, name: true, images: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    // Get ratings on all products of this seller
    const ratings = await prisma.rating.findMany({
      where: {
        productId: { in: sellerProductIds }
      },
      select: { userId: true, productId: true, value: true }
    });

    const ratingLookup = new Map<string, number>();
    for (const r of ratings) {
      ratingLookup.set(`${r.userId}_${r.productId}`, r.value);
    }

    const recentReviews = reviews.map(rev => ({
      id: rev.id,
      text: rev.text,
      createdAt: rev.createdAt,
      user: rev.user,
      product: rev.product,
      rating: ratingLookup.get(`${rev.userId}_${rev.productId}`) || 5
    }));

    // Calculate live operational metrics across all artisan products and orders
    const totalItems = orderItems.length + cancelledItems.length;
    const deliveredItems = orderItems.filter(i => i.order?.status === 'DELIVERED').length;
    const dispatchedItems = orderItems.filter(i => i.dispatchedAt);
    const onTimeDispatches = dispatchedItems.filter(i => i.isDispatchedOnTime !== false).length;
    const returnedItems = orderItems.filter(i => i.returned).length;

    // 1. Live Average Rating & Normalized Rating Score (30%)
    let avgRating = 0;
    let totalRatingsCount = 0;
    if (ratings.length > 0) {
      avgRating = Number((ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length).toFixed(1));
      totalRatingsCount = ratings.length;
    } else {
      let totalWeighted = 0;
      for (const p of sellerProducts) {
        if (p.reviewsCount > 0 && p.averageRating > 0) {
          totalWeighted += p.averageRating * p.reviewsCount;
          totalRatingsCount += p.reviewsCount;
        }
      }
      avgRating = totalRatingsCount > 0 ? Number((totalWeighted / totalRatingsCount).toFixed(1)) : 0;
    }

    // Bayesian smoothed rating score (0.0 to 1.0)
    let ratingScore = 0.70; // baseline if unrated
    if (totalRatingsCount > 0 && avgRating > 0) {
      const smoothed = (avgRating * totalRatingsCount + 4.0 * 3.0) / (totalRatingsCount + 3.0);
      ratingScore = Number(Math.max(0.0, Math.min(1.0, (smoothed - 1.0) / 4.0)).toFixed(4));
    }

    // 2. Live Fulfilment Rate (25%)
    const fulfilmentRate = totalItems > 0 
      ? Number(Math.max(0.0, Math.min(1.0, (totalItems - cancelledItems.length) / totalItems)).toFixed(4))
      : 1.0;

    // 3. Live Dispatch SLA Score (20%)
    const dispatchSlaScore = dispatchedItems.length > 0 
      ? Number(Math.max(0.0, Math.min(1.0, onTimeDispatches / dispatchedItems.length)).toFixed(4))
      : 1.0;

    // 4. Live Cancellation Rate (15%) & Control Score
    const cancellationRate = totalItems > 0 
      ? Number(Math.max(0.0, Math.min(1.0, cancelledItems.length / totalItems)).toFixed(4))
      : 0.0;
    const cancellationScore = Number(Math.max(0.0, Math.min(1.0, 1.0 - 3.0 * cancellationRate)).toFixed(4));

    // 5. Live Return Rate (10%) & Quality Score
    const returnRate = deliveredItems > 0 
      ? Number(Math.max(0.0, Math.min(1.0, returnedItems / deliveredItems)).toFixed(4))
      : 0.0;
    const returnScore = Number(Math.max(0.0, Math.min(1.0, 1.0 - 5.0 * returnRate)).toFixed(4));

    // Composite Weighted Trust Score
    const rawTrustScore = Number((
      0.30 * ratingScore +
      0.25 * fulfilmentRate +
      0.20 * dispatchSlaScore +
      0.15 * cancellationScore +
      0.10 * returnScore
    ).toFixed(4));

    // Cold-start volume confidence
    const confidence = Number((1.0 - Math.exp(-totalItems / 10.0)).toFixed(4));
    const isColdStart = totalItems < 5;
    const finalTrustScore = isColdStart
      ? Number((0.70 * (1.0 - confidence) + rawTrustScore * confidence).toFixed(4))
      : rawTrustScore;

    // Trust badge resolution
    let trustBadge = 'STANDARD';
    if (finalTrustScore >= 0.88 && deliveredItems >= 5) trustBadge = 'TOP_RATED';
    else if (finalTrustScore >= 0.80 && dispatchSlaScore >= 0.95 && deliveredItems >= 3) trustBadge = 'FAST_DISPATCH';
    else if (finalTrustScore >= 0.70) trustBadge = 'RELIABLE';
    else if (finalTrustScore >= 0.55) trustBadge = 'STANDARD';
    else trustBadge = 'AT_RISK';

    // Calculate real revenue (only non-cancelled items)
    const revenue = orderItems.reduce((acc, item) => acc + (item.priceAtBuy * item.quantity), 0);

    // Persist computed live metrics back to database
    if (seller && seller.id) {
      try {
        await prisma.seller.update({
          where: { id: seller.id },
          data: {
            rating: avgRating || (seller.rating > 0 ? seller.rating : 0),
            sellerTrustScore: finalTrustScore,
            ratingScore,
            fulfilmentRate,
            dispatchSlaScore,
            cancellationRate,
            returnRate,
            totalCompletedOrders: deliveredItems,
            trustBadge,
            isNewSeller: isColdStart,
          }
        });
      } catch (err) {
        console.warn('Could not persist updated seller metrics:', err);
      }
    }

    // Get recent products by seller
    const recentProducts = await prisma.product.findMany({
      where: { sellerId: { in: sellerIds } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { category: true }
    });

    res.json({
      revenue,
      activeListings,
      recentProducts,
      recentOrders: orderItems,
      cancelledOrders: cancelledItems,
      recentReviews,
      totalReviews: reviews.length,
      totalOrders: totalItems,
      cancelPenalty: seller?.cancelPenalty || 0,
      returnPenalty: seller?.returnPenalty || 0,
      sellerRating: avgRating || seller?.rating || 0,
      sellerTrustScore: finalTrustScore,
      ratingScore,
      fulfilmentRate,
      dispatchSlaScore,
      cancellationRate,
      returnRate,
      totalCompletedOrders: deliveredItems,
      trustBadge,
      isNewSeller: isColdStart,
    });
  } catch (error) {
    console.error('Fetch seller stats error:', error);
    res.status(500).json({ error: 'Failed to fetch seller stats' });
  }
});

// POST New Product
router.post('/products', async (req, res) => {
  try {
    const data = req.body;
    
    if (!data.name || !data.price || !data.sellerId || !data.categoryId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Resolve sellerId if a User ID was passed
    let sellerId = data.sellerId;
    let sellerExists = await prisma.seller.findUnique({ where: { id: sellerId } });
    if (!sellerExists) {
      const user = await prisma.user.findUnique({ where: { id: sellerId } });
      if (user) {
        const matchingSeller = await prisma.seller.findUnique({ where: { email: user.email } });
        if (matchingSeller) {
          sellerId = matchingSeller.id;
        }
      }
    }

    const newProduct = await prisma.product.create({
      data: {
        name: data.name,
        description: data.description || '',
        price: parseFloat(data.price),
        inventory: parseInt(data.inventory || '1'),
        craftType: data.craftType,
        sellerId,
        categoryId: data.categoryId,
        tags: data.tags || [],
        materials: data.materials || [],
        images: {
          create: [{ url: data.imageUrl || '/products/product-vase.jpg' }]
        }
      },
      include: { images: true }
    });

    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// GET Seller Products List
router.get('/products/list/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    let resolvedSellerId = sellerId;
    let seller = await prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) {
      const user = await prisma.user.findUnique({ where: { id: sellerId } });
      if (user) {
        const matchingSeller = await prisma.seller.findUnique({ where: { email: user.email } });
        if (matchingSeller) {
          seller = matchingSeller;
          resolvedSellerId = matchingSeller.id;
        }
      }
    }

    const sellerIds = [resolvedSellerId];
    if (seller?.email === 'seller@gmail.com' || seller?.email === 'delivery@gmail.com' || seller?.email === 'abhishekhegdea@gmail.com') {
      const demoSellers = await prisma.seller.findMany({
        where: { email: { in: ['seller@gmail.com', 'delivery@gmail.com', 'abhishekhegdea@gmail.com'] } },
        select: { id: true }
      });
      demoSellers.forEach(s => {
        if (!sellerIds.includes(s.id)) sellerIds.push(s.id);
      });
    }

    const products = await prisma.product.findMany({
      where: { sellerId: { in: sellerIds } },
      include: { category: true, images: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(products);
  } catch (error) {
    console.error('Fetch seller products error:', error);
    res.status(500).json({ error: 'Failed to fetch seller products' });
  }
});

// PUT Update Product
router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    // In production we would verify req.user.id matches product.sellerId
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        name: data.name,
        price: data.price ? parseFloat(data.price) : undefined,
        inventory: data.inventory !== undefined ? parseInt(data.inventory) : undefined,
        description: data.description,
      },
      include: { category: true, images: true }
    });
    
    res.json(updatedProduct);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// PUT Cancel an order item (seller-initiated cancellation)
// Deducts from the seller's cancelPenalty (negative score for the recommendation system)
router.put('/orders/:orderItemId/cancel', async (req, res) => {
  try {
    const { orderItemId } = req.params;

    // Find the order item and verify it belongs to this seller's product
    const orderItem = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        product: { select: { sellerId: true } },
        order: { select: { id: true, status: true } },
      },
    });

    if (!orderItem) {
      return res.status(404).json({ error: 'Order item not found.' });
    }

    if (orderItem.cancelled) {
      return res.status(400).json({ error: 'This item has already been cancelled.' });
    }

    if (orderItem.order.status === 'DELIVERED') {
      return res.status(400).json({ error: 'Cannot cancel a delivered order item.' });
    }

    // Verify sellerId from request body matches
    const { sellerId } = req.body;
    let allowedSellers = [sellerId];
    if (sellerId) {
      const currentSeller = await prisma.seller.findUnique({ where: { id: sellerId } });
      if (currentSeller?.email === 'seller@gmail.com' || currentSeller?.email === 'delivery@gmail.com' || currentSeller?.email === 'abhishekhegdea@gmail.com') {
        const demoSellers = await prisma.seller.findMany({
          where: { email: { in: ['seller@gmail.com', 'delivery@gmail.com', 'abhishekhegdea@gmail.com'] } },
          select: { id: true }
        });
        allowedSellers = demoSellers.map(s => s.id);
      }
    }

    if (!sellerId || !allowedSellers.includes(orderItem.product.sellerId)) {
      return res.status(403).json({ error: 'Unauthorized to cancel this item.' });
    }

    // Flat penalty per cancelled item (constant points deducted from seller's recommendation score)
    const PENALTY_PER_ITEM = 5.0;

    const [updatedItem] = await prisma.$transaction([
      // Mark the order item as cancelled
      prisma.orderItem.update({
        where: { id: orderItemId },
        data: {
          cancelled: true,
          cancelledAt: new Date(),
          cancelledBy: 'SELLER',
        },
      }),
      // Increase the seller's cancel penalty (negative score for recommendations)
      prisma.seller.update({
        where: { id: orderItem.product.sellerId },
        data: {
          cancelPenalty: {
            increment: PENALTY_PER_ITEM,
          },
        },
      }),
      // Restore inventory for the cancelled product
      prisma.product.update({
        where: { id: orderItem.productId },
        data: {
          inventory: {
            increment: orderItem.quantity,
          },
        },
      }),
    ]);

    // Cancellation is logged via the transaction changes above.
    // UserBehaviour event logging skipped (userId FK constraint requires a valid User).

    res.json({
      success: true,
      message: `Item cancelled. Penalty of ${PENALTY_PER_ITEM} points applied to seller score.`,
      penalty: PENALTY_PER_ITEM,
    });
  } catch (error) {
    console.error('Cancel order item error:', error);
    res.status(500).json({ error: 'Failed to cancel order item.' });
  }
});

// PUT Dispatch Order Item (Records on-time dispatch SLA)
router.put('/orders/:orderItemId/dispatch', async (req, res) => {
  try {
    const { orderItemId } = req.params;
    const { sellerId } = req.body;

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { product: true, order: true },
    });

    if (!orderItem) {
      return res.status(404).json({ error: 'Order item not found.' });
    }

    let allowedSellers = [sellerId];
    if (sellerId) {
      const currentSeller = await prisma.seller.findUnique({ where: { id: sellerId } });
      if (currentSeller?.email === 'seller@gmail.com' || currentSeller?.email === 'delivery@gmail.com' || currentSeller?.email === 'abhishekhegdea@gmail.com') {
        const demoSellers = await prisma.seller.findMany({
          where: { email: { in: ['seller@gmail.com', 'delivery@gmail.com', 'abhishekhegdea@gmail.com'] } },
          select: { id: true }
        });
        allowedSellers = demoSellers.map(s => s.id);
      }
    }

    if (sellerId && !allowedSellers.includes(orderItem.product.sellerId)) {
      return res.status(403).json({ error: 'Unauthorized to dispatch this item.' });
    }

    const now = new Date();
    // Default SLA: 48 hours from order creation
    const orderCreated = new Date(orderItem.order.createdAt);
    const expectedDispatch = orderItem.expectedDispatchAt || new Date(orderCreated.getTime() + 48 * 60 * 60 * 1000);
    const isOnTime = now.getTime() <= expectedDispatch.getTime();

    const updatedItem = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: {
        dispatchedAt: now,
        expectedDispatchAt: expectedDispatch,
        isDispatchedOnTime: isOnTime,
      },
    });

    res.json({
      success: true,
      message: isOnTime ? 'Dispatched on time within SLA!' : 'Dispatched (marked as late dispatch).',
      orderItem: updatedItem,
      isOnTime,
    });
  } catch (error) {
    console.error('Dispatch order item error:', error);
    res.status(500).json({ error: 'Failed to dispatch order item.' });
  }
});

export default router;
