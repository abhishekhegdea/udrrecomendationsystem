import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Middleware to verify JWT
const authMiddleware = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.get('/me', authMiddleware, async (req: any, res: any) => {
  try {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { id: req.user.id }
    });

    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    res.json({ user: partner });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// GET assigned orders for delivery partner
router.get('/orders/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;
    
    const orders = await prisma.order.findMany({
      where: { deliveryPartnerId: partnerId },
      include: {
        user: { select: { firstName: true, lastName: true, phone: true } },
        items: { include: { product: { select: { name: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(orders);
  } catch (error) {
    console.error('Fetch partner orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// POST Mark order as delivered
router.post('/orders/:orderId/deliver', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { partnerId } = req.body;

    // Update order status
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'DELIVERED' }
    });

    // Update partner stats (flat ₹50 per delivery for now)
    if (partnerId) {
      await prisma.deliveryPartner.update({
        where: { id: partnerId },
        data: {
          deliveries: { increment: 1 },
          todayDeliveries: { increment: 1 },
          earnings: { increment: 50 }
        }
      });
    }

    res.json(order);
  } catch (error) {
    console.error('Deliver order error:', error);
    res.status(500).json({ error: 'Failed to mark order as delivered' });
  }
});

export default router;
