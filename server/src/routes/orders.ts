import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// GET all orders for a specific customer
router.get('/customer/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(orders);
  } catch (error) {
    console.error('Fetch customer orders error:', error);
    res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
});

// POST Create a new order (Checkout)
//
// The order is built from the user's PERSISTED cart (source of truth): the
// client passes the CartItem ids it wants to purchase, the server loads those
// rows from the DB, derives items/quantities/prices from them, creates the
// order, decrements inventory, and consumes the cart — all in one transaction.
// A legacy `items` fallback is kept for callers that don't use the server cart.
router.post('/checkout', async (req, res) => {
  try {
    const { userId, items, totalAmount, cartItemIds } = req.body;

    if (!userId || !totalAmount) {
      return res.status(400).json({ error: 'Missing required checkout fields' });
    }

    // ── Load the persisted cart (source of truth) ─────────────────────
    const cartRows = await prisma.cartItem.findMany({
      where: { userId },
      include: { product: true },
    });

    let lineItems: { productId: string; quantity: number; priceAtBuy: number; cartItemId?: string }[];
    let purchasedCartIds: string[] = [];

    if (cartRows.length > 0) {
      let selected = cartRows;

      // Validate the requested CartItem ids belong to this user's cart
      if (Array.isArray(cartItemIds) && cartItemIds.length > 0) {
        const cartIds = new Set(cartRows.map((c) => c.id));
        const missing = cartItemIds.filter((id: string) => !cartIds.has(id));
        if (missing.length > 0) {
          return res.status(409).json({
            error: 'Your cart has changed since checkout started. Please review your cart and try again.',
          });
        }
        selected = cartRows.filter((c) => cartItemIds.includes(c.id));
      }

      if (selected.length === 0) {
        return res.status(400).json({ error: 'Your cart is empty' });
      }

      // Derive line items from the persisted rows — quantities and prices
      // come from the DB, never from the client. Each order item records
      // the CartItem row it was created from (audit reference).
      lineItems = selected.map((c) => ({
        productId: c.productId,
        quantity: c.quantity,
        priceAtBuy: c.product?.price ?? 0,
        cartItemId: c.id,
      }));
      purchasedCartIds = selected.map((c) => c.id);
    } else if (items && items.length) {
      // Legacy fallback — no persisted cart for this user
      for (const item of items) {
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          return res.status(404).json({ error: `Product not found (ID: ${item.productId}). Your cart may contain items that are no longer available. Please clear your cart and try again.` });
        }
      }
      lineItems = items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
        priceAtBuy: item.priceAtBuy,
      }));
    } else {
      return res.status(400).json({ error: 'Your cart is empty' });
    }

    // Create the order, decrement inventory, and consume the cart atomically
    const order = await prisma.$transaction(async (tx) => {
      // 1. Create Order + items
      const newOrder = await tx.order.create({
        data: {
          userId,
          totalAmount,
          status: 'PENDING',
          items: { create: lineItems },
        },
        include: { items: true },
      });

      // 2. Decrement Inventory for each product
      for (const item of lineItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { inventory: { decrement: item.quantity } },
        });
      }

      // 3. Consume the purchased cart rows
      if (purchasedCartIds.length > 0) {
        await tx.cartItem.deleteMany({
          where: { id: { in: purchasedCartIds }, userId },
        });
      }

      return newOrder;
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Checkout failed' });
  }
});
// PATCH Cancel an order (if PENDING)
router.patch('/:orderId/cancel', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'PENDING') return res.status(400).json({ error: 'Only pending orders can be cancelled' });

    // Cancel the order and restore inventory in a transaction
    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Restore inventory
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { inventory: { increment: item.quantity } }
        });
      }
      
      // Update items
      await tx.orderItem.updateMany({
        where: { orderId: orderId },
        data: { cancelled: true, cancelledAt: new Date(), cancelledBy: 'CUSTOMER' }
      });

      // Update order status
      return await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' }
      });
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// Return reasons. QUALITY and DAMAGED are quality-affecting: they damage
// the seller's global returnPenalty AND down-weight the brand for this
// customer in the recommendation engine.
const RETURN_REASONS = ['QUALITY', 'DAMAGED', 'MISTAKE', 'OTHER'];
const QUALITY_REASONS = ['QUALITY', 'DAMAGED'];

// PATCH Return a delivered item
router.patch('/:orderId/items/:itemId/return', async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason, reviewText, rating } = req.body || {};

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'DELIVERED') return res.status(400).json({ error: 'Can only return items from delivered orders' });

    const orderItem = await prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!orderItem) return res.status(404).json({ error: 'Order item not found' });
    if (orderItem.orderId !== orderId) return res.status(400).json({ error: 'Item does not belong to this order' });
    if (orderItem.returned) return res.status(400).json({ error: 'Item already returned' });

    const safeReason = RETURN_REASONS.includes(reason) ? reason : 'OTHER';
    const qualityIssue = QUALITY_REASONS.includes(safeReason);

    // Load product meta for the behaviour row + seller penalty
    const product = await prisma.product.findUnique({
      where: { id: orderItem.productId },
      select: { categoryId: true, sellerId: true, brandId: true, brand: true },
    });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Mark as returned, restore inventory, record the ML signal, and apply
    // the quality-return seller penalty — all atomically.
    const updatedItem = await prisma.$transaction(async (tx) => {
      // Atomic claim: only ONE request can flip returned=false → true, so
      // two concurrent returns can't double-restore inventory, double-bump
      // the seller penalty, or write duplicate RETURN rows.
      const claimed = await tx.orderItem.updateMany({
        where: { id: itemId, orderId, returned: false },
        data: {
          returned: true,
          returnedAt: new Date(),
          returnReason: safeReason,
          returnReviewText: reviewText || null,
          returnRating: rating ?? null,
        },
      });

      if (claimed.count !== 1) {
        // Lost the race (or already returned) — no side effects applied.
        return tx.orderItem.findUnique({ where: { id: itemId } });
      }

      await tx.product.update({
        where: { id: orderItem.productId },
        data: { inventory: { increment: orderItem.quantity } }
      });

      if (qualityIssue) {
        await tx.seller.update({
          where: { id: product.sellerId },
          data: { returnPenalty: { increment: 1 } },
        });
      }

      // Single source of truth for the ML engine: a RETURN UserBehaviour row
      // carrying the reason / review / rating in metadata.
      await tx.userBehaviour.create({
        data: {
          userId: order.userId,
          eventType: 'RETURN',
          productId: orderItem.productId,
          categoryId: product.categoryId,
          sellerId: product.sellerId,
          brandId: product.brandId,
          source: 'customer_dashboard',
          metadata: {
            orderId,
            quantity: orderItem.quantity,
            reason: safeReason,
            reviewText: reviewText || null,
            rating: rating ?? null,
            qualityIssue,
          },
        },
      });

      return tx.orderItem.findUnique({ where: { id: itemId } });
    });

    res.json(updatedItem);
  } catch (error) {
    console.error('Return item error:', error);
    res.status(500).json({ error: 'Failed to process return' });
  }
});

export default router;
