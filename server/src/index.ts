// Trigger restart for Prisma client update 2
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import partnerRoutes from './routes/partner';
import sellerRoutes from './routes/seller';
import productRoutes from './routes/products';
import eventRoutes from './routes/events';
import recommendationRoutes from './routes/recommendations';
import orderRoutes from './routes/orders';
import cartRoutes from './routes/cart';
import adminRoutes from './routes/admin';
import locationRoutes from './routes/locations';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/locations', locationRoutes);

// Basic health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
