import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// GET all orders (Admin view)
router.get('/orders', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { firstName: true, lastName: true, phone: true } },
        items: true,
        deliveryPartner: { select: { firstName: true, lastName: true, phone: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(orders);
  } catch (error) {
    console.error('Fetch all orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// POST assign delivery partner to order
router.post('/assign', async (req, res) => {
  try {
    const { orderId, deliveryPartnerId } = req.body;

    if (!orderId || !deliveryPartnerId) {
      return res.status(400).json({ error: 'Missing orderId or deliveryPartnerId' });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryPartnerId,
        status: 'ASSIGNED' // or 'OUT_FOR_DELIVERY'
      }
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error('Assign order error:', error);
    res.status(500).json({ error: 'Failed to assign order' });
  }
});

// GET all delivery partners (Admin view)
router.get('/partners', async (req, res) => {
  try {
    const partners = await prisma.deliveryPartner.findMany({
      orderBy: { rating: 'desc' }
    });
    res.json(partners);
  } catch (error) {
    console.error('Fetch partners error:', error);
    res.status(500).json({ error: 'Failed to fetch partners' });
  }
});

// GET all customers (Admin view)
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        createdAt: true,
        profileImage: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET all sellers (Admin view)
router.get('/sellers', async (req, res) => {
  try {
    const sellers = await prisma.seller.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        businessName: true,
        gstNumber: true,
        status: true,
        createdAt: true,
        profileImage: true,
        rating: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(sellers);
  } catch (error) {
    console.error('Fetch sellers error:', error);
    res.status(500).json({ error: 'Failed to fetch sellers' });
  }
});

// Approve Seller
router.put('/approve-seller/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await prisma.seller.update({
      where: { id },
      data: { status: 'VERIFIED' }
    });
    res.json(seller);
  } catch (error) {
    console.error('Approve seller error:', error);
    res.status(500).json({ error: 'Failed to approve seller' });
  }
});

// Approve Partner
router.put('/approve-partner/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await prisma.deliveryPartner.update({
      where: { id },
      data: { status: 'VERIFIED' }
    });
    res.json(partner);
  } catch (error) {
    console.error('Approve partner error:', error);
    res.status(500).json({ error: 'Failed to approve partner' });
  }
});
// --- ML VERIFICATION DEBUG ENDPOINTS ---

router.get('/debug/stats', async (req, res) => {
  try {
    const totalSellers = await prisma.seller.count();
    const totalBuyers = await prisma.user.count({ where: { role: 'CUSTOMER' } });
    const totalProducts = await prisma.product.count();
    const totalOrders = await prisma.order.count();
    const totalWishlists = await prisma.wishlist.count();
    const totalViews = await prisma.productView.count();
    
    // Send back all the seeded buyers so the UI dropdown can select them
    const buyers = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: { id: true, firstName: true, email: true }
    });

    res.json({
      totalSellers,
      totalBuyers,
      totalProducts,
      totalOrders,
      totalWishlists,
      totalViews,
      buyers
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch debug stats' });
  }
});

router.get('/debug/buyer/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    const views = await prisma.productView.findMany({
      where: { userId },
      include: { product: { select: { name: true, category: { select: { name: true } } } } }
    });
    
    const purchases = await prisma.orderItem.findMany({
      where: { order: { userId } },
      include: { product: { select: { name: true, category: { select: { name: true } } } } }
    });
    
    const wishlist = await prisma.wishlist.findMany({
      where: { userId },
      include: { product: { select: { name: true, category: { select: { name: true } } } } }
    });
    
    const searches = await prisma.searchHistory.findMany({
      where: { userId },
      select: { query: true }
    });

    res.json({ views, purchases, wishlist, searches });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch buyer history' });
  }
});

export default router;
