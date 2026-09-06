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

// POST add to cart (idempotent with strict inventory limit enforcement)
router.post('/', async (req, res) => {
  try {
    const { userId, productId } = req.body;
    const quantity = Math.max(1, parseInt(req.body.quantity) || 1);
    if (!userId || !productId) return res.status(400).json({ error: 'Missing fields' });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true, brandId: true, inventory: true, name: true },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.inventory <= 0) {
      return res.status(400).json({
        error: `"${product.name}" is currently out of stock.`,
        availableInventory: 0,
      });
    }

    const existing = await prisma.cartItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });

    const currentQty = existing?.quantity || 0;
    const newTotal = currentQty + quantity;

    if (newTotal > product.inventory) {
      return res.status(400).json({
        error: `Cannot add ${quantity} more item(s). Only ${product.inventory} unit(s) available in stock${currentQty > 0 ? ` (you already have ${currentQty} in cart)` : ''}.`,
        availableInventory: product.inventory,
        currentInCart: currentQty,
      });
    }

    const cartItem = await prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: {
        quantity: { increment: quantity },
        categoryId: product.categoryId,
        brandId: product.brandId,
      },
      create: {
        userId,
        productId,
        quantity,
        categoryId: product.categoryId,
        brandId: product.brandId,
      },
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

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true, brandId: true, inventory: true, name: true },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (quantity > product.inventory) {
      return res.status(400).json({
        error: `Requested quantity (${quantity}) exceeds available stock (${product.inventory} available).`,
        availableInventory: product.inventory,
      });
    }

    const cartItem = await prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: {
        quantity,
        categoryId: product.categoryId,
        brandId: product.brandId,
      },
      create: {
        userId,
        productId,
        quantity,
        categoryId: product.categoryId,
        brandId: product.brandId,
      },
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
