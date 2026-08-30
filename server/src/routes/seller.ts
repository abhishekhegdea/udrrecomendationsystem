import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// GET Seller Dashboard Stats & Orders
router.get('/stats/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;

    const activeListings = await prisma.product.count({
      where: { sellerId }
    });

    // Get order items for this seller's products (exclude cancelled items)
    const orderItems = await prisma.orderItem.findMany({
      where: { 
        product: { sellerId },
        cancelled: false  // Only non-cancelled items
      },
      include: {
        order: { select: { id: true, createdAt: true, status: true, user: { select: { firstName: true } } } },
        product: { select: { name: true, images: true } }
      },
      orderBy: { order: { createdAt: 'desc' } }
    });

    // Also get cancelled items separately for display
    const cancelledItems = await prisma.orderItem.findMany({
      where: { 
        product: { sellerId },
        cancelled: true
      },
      include: {
        order: { select: { id: true, createdAt: true, status: true, user: { select: { firstName: true } } } },
        product: { select: { name: true, images: true } }
      },
      orderBy: { cancelledAt: 'desc' },
      take: 20,
    });

    // Calculate real revenue (only non-cancelled items)
    const revenue = orderItems.reduce((acc, item) => acc + (item.priceAtBuy * item.quantity), 0);

    // Get the seller's cancel penalty (for recommendation scoring)
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      select: { cancelPenalty: true, rating: true },
    });

    // Get recent products by seller
    const recentProducts = await prisma.product.findMany({
      where: { sellerId },
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
      cancelPenalty: seller?.cancelPenalty || 0,
      sellerRating: seller?.rating || 0,
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

    const newProduct = await prisma.product.create({
      data: {
        name: data.name,
        description: data.description || '',
        price: parseFloat(data.price),
        inventory: parseInt(data.inventory || '1'),
        craftType: data.craftType,
        sellerId: data.sellerId,
        categoryId: data.categoryId,
        tags: data.tags || [],
        materials: data.materials || [],
        images: {
          create: [{ url: data.imageUrl || '/products/product-vase.jpg' }]
        }
      },
      include: { images: true }
    });

    // Trigger ML generation in a real production environment
    // e.g. axios.post('http://localhost:8000/api/v1/ml/generate-embedding', { productId: newProduct.id })

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
    const products = await prisma.product.findMany({
      where: { sellerId },
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
    if (!sellerId || orderItem.product.sellerId !== sellerId) {
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
        where: { id: sellerId },
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

export default router;
