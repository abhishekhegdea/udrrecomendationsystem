import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// GET all products (paginated + filters)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    
    const q = req.query.q as string;
    const categoryId = req.query.categoryId as string;
    const categoryName = req.query.categoryName as string;
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;

    const whereClause: any = {};
    if (q) {
      whereClause.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { tags: { has: q } }
      ];
    }
    if (categoryId) {
      whereClause.categoryId = categoryId;
    }
    if (categoryName) {
      whereClause.category = {
        name: { contains: categoryName, mode: 'insensitive' }
      };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      whereClause.price = {};
      if (minPrice !== undefined) whereClause.price.gte = minPrice;
      if (maxPrice !== undefined) whereClause.price.lte = maxPrice;
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      skip,
      take: limit,
      include: {
        images: true,
        seller: { select: { businessName: true, firstName: true, rating: true, isNewSeller: true } },
        category: { select: { name: true, id: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    const total = await prisma.product.count({ where: whereClause });

    res.json({
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Fetch products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET all categories
router.get('/categories/all', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: { subcategories: true }
    });
    res.json(categories);
  } catch (error) {
    console.error('Fetch categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        images: true,
        seller: { select: { id: true, businessName: true, firstName: true, rating: true, isNewSeller: true } },
        category: true,
        subcategory: true
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Fetch product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST new product (dummy auth for now, assumes middleware would inject sellerId)
router.post('/', async (req, res) => {
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
        discount: parseFloat(data.discount || '0'),
        craftType: data.craftType,
        inventory: parseInt(data.inventory || '0'),
        tags: data.tags || [],
        materials: data.materials || [],
        sellerId: data.sellerId,
        categoryId: data.categoryId,
        subcategoryId: data.subcategoryId,
        images: {
          create: (data.images || []).map((url: string) => ({ url }))
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

// --- WISHLIST ENDPOINTS ---

// GET wishlist for user
router.get('/wishlist/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const wishlist = await prisma.wishlist.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            images: true,
            seller: { select: { businessName: true } },
            category: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(wishlist);
  } catch (error) {
    console.error('Fetch wishlist error:', error);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

// POST add to wishlist
router.post('/wishlist', async (req, res) => {
  try {
    const { userId, productId } = req.body;
    if (!userId || !productId) return res.status(400).json({ error: 'Missing fields' });

    const wishlistItem = await prisma.wishlist.create({
      data: { userId, productId },
      include: { product: true }
    });
    res.status(201).json(wishlistItem);
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ error: 'Failed to add to wishlist' });
  }
});

// DELETE remove from wishlist
router.delete('/wishlist/:userId/:productId', async (req, res) => {
  try {
    const { userId, productId } = req.params;
    await prisma.wishlist.deleteMany({
      where: { userId, productId }
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ error: 'Failed to remove from wishlist' });
  }
});

export default router;
