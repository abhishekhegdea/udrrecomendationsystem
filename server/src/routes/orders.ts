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
router.post('/checkout', async (req, res) => {
  try {
    const { userId, items, totalAmount } = req.body;
    
    if (!userId || !items || !items.length || !totalAmount) {
      return res.status(400).json({ error: 'Missing required checkout fields' });
    }

    // Validate all products exist
    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) {
        return res.status(404).json({ error: `Product not found (ID: ${item.productId}). Your cart may contain items that are no longer available. Please clear your cart and try again.` });
      }
    }

    // Create the order and items in a transaction
    const order = await prisma.$transaction(async (tx) => {
      // 1. Create Order
      const newOrder = await tx.order.create({
        data: {
          userId,
          totalAmount,
          status: 'PENDING',
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
              priceAtBuy: item.priceAtBuy
            }))
          }
        },
        include: { items: true }
      });

      // 2. Decrement Inventory for each product
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            inventory: {
              decrement: item.quantity
            }
          }
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

export default router;
