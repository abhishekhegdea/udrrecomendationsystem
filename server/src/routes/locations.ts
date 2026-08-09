import express from 'express';
import { prisma } from '../db';

const router = express.Router();

router.get('/states', async (req, res) => {
  try {
    const states = await prisma.state.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(states);
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/cities/:stateId', async (req, res) => {
  try {
    const cities = await prisma.city.findMany({
      where: { stateId: req.params.stateId },
      orderBy: { name: 'asc' }
    });
    res.json(cities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
