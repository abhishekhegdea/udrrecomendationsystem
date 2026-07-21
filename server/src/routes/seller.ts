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

    // Get order items for this seller's products
    const orderItems = await prisma.orderItem.findMany({
      where: { product: { sellerId } },
      include: {
        order: { select: { id: true, createdAt: true, status: true, user: { select: { firstName: true } } } },
        product: { select: { name: true, images: true } }
      },
      orderBy: { order: { createdAt: 'desc' } }
    });

    // Calculate real revenue
    const revenue = orderItems.reduce((acc, item) => acc + (item.priceAtBuy * item.quantity), 0);

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
      recentOrders: orderItems
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

export default router;
