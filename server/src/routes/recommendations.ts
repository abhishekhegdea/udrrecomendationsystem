import { Router } from 'express';
import axios from 'axios';

const router = Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000/api/v1/recommendations';

router.get('/home/:userId', async (req, res) => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/home/${req.params.userId}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching home recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

router.get('/product/:productId', async (req, res) => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/product/${req.params.productId}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching similar products:', error);
    res.status(500).json({ error: 'Failed to fetch similar products' });
  }
});

router.get('/trending', async (req, res) => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/trending`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching trending products:', error);
    res.status(500).json({ error: 'Failed to fetch trending products' });
  }
});

router.get('/new-arrivals', async (req, res) => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/new-arrivals`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching new arrivals:', error);
    res.status(500).json({ error: 'Failed to fetch new arrivals' });
  }
});

// GET also-bought — products frequently purchased together with the given product
router.get('/also-bought/:productId', async (req, res) => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/also-bought/${req.params.productId}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching also-bought:', error);
    res.status(500).json({ error: 'Failed to fetch also-bought products' });
  }
});

export default router;
