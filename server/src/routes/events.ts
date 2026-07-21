import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// POST track product view
router.post('/view', async (req, res) => {
  try {
    const { userId, productId, timeSpent, scrollDepth } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }

    const view = await prisma.productView.create({
      data: {
        userId: userId || null,
        productId,
        timeSpent: timeSpent ? parseInt(timeSpent) : null,
        scrollDepth: scrollDepth ? parseInt(scrollDepth) : null,
      }
    });

    res.status(201).json(view);
  } catch (error) {
    console.error('Track view error:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
});

// POST track click
router.post('/click', async (req, res) => {
  try {
    const { userId, productId, source } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }

    const click = await prisma.clickEvent.create({
      data: {
        userId: userId || null,
        productId,
        source: source || 'unknown'
      }
    });

    res.status(201).json(click);
  } catch (error) {
    console.error('Track click error:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
});

// POST track search
router.post('/search', async (req, res) => {
  try {
    const { userId, query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }

    const search = await prisma.searchHistory.create({
      data: {
        userId: userId || null,
        query
      }
    });

    res.status(201).json(search);
  } catch (error) {
    console.error('Track search error:', error);
    res.status(500).json({ error: 'Failed to track search' });
  }
});

// POST track behaviour (wishlist, cart addition, etc is logged here or via their own CRUD)
router.post('/behaviour', async (req, res) => {
  try {
    const { userId, eventType, metadata } = req.body;
    
    if (!userId || !eventType) {
      return res.status(400).json({ error: 'User ID and eventType required' });
    }

    const behaviour = await prisma.userBehaviour.create({
      data: {
        userId,
        eventType,
        metadata: metadata || {}
      }
    });

    res.status(201).json(behaviour);
  } catch (error) {
    console.error('Track behaviour error:', error);
    res.status(500).json({ error: 'Failed to track behaviour' });
  }
});

export default router;
