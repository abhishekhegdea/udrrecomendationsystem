import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// Shared include: product details needed by the storefront cart display
const cartInclude = {
  product: {
    include: {
      images: true,
      seller: { select: { businessName: true, firstName: true } },
    },
  },
} as const;

// GET all cart items for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const items = await prisma.cartItem.findMany({
      where: { userId },
      include: cartInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (error) {
    console.error('Fetch cart error:', error);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST add to cart (idempotent — adding a product already in the cart
// atomically increments its quantity instead of hitting the unique-constraint
// 500; the atomic { increment } avoids read-then-write races under
// double-clicks)
router.post('/', async (req, res) => {
  try {
    const { userId, productId } = req.body;
    const quantity = Math.max(1, parseInt(req.body.quantity) || 1);
    if (!userId || !productId) return res.status(400).json({ error: 'Missing fields' });

    const cartItem = await prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: { quantity: { increment: quantity } },
      create: { userId, productId, quantity },
      include: cartInclude,
    });
    res.status(201).json(cartItem);
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

// PUT set an exact quantity for a cart item (used by quantity steppers)
router.put('/:userId/:productId', async (req, res) => {
  try {
    const { userId, productId } = req.params;
    const quantity = Math.max(0, parseInt(req.body.quantity) || 0);

    if (quantity <= 0) {
      // Setting to 0 means remove the item
      await prisma.cartItem.deleteMany({ where: { userId, productId } });
      return res.status(200).json({ success: true });
    }

    const cartItem = await prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: { quantity },
      create: { userId, productId, quantity },
      include: cartInclude,
    });
    res.status(200).json(cartItem);
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// DELETE remove a single item from the cart
router.delete('/:userId/:productId', async (req, res) => {
  try {
    const { userId, productId } = req.params;
    await prisma.cartItem.deleteMany({ where: { userId, productId } });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Failed to remove from cart' });
  }
});

// DELETE clear the user's entire cart
router.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await prisma.cartItem.deleteMany({ where: { userId } });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

export default router;
