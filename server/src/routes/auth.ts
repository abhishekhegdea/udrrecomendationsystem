import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { geocodeAddress, reverseGeocode, type GoogleResolvedLocation } from '../services/googleMaps';

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
    const { id, role } = req.user;
    
    if (role === 'DELIVERY') {
      const partner = await prisma.deliveryPartner.findUnique({ where: { id } });
      return res.json({ user: partner ? { ...partner, role: 'DELIVERY' } : null });
    } 
    
    if (role === 'SELLER') {
      const seller = await prisma.seller.findUnique({ where: { id } });
      if (seller) {
        const { password: _, ...safeSeller } = seller;
        return res.json({ user: { ...safeSeller, role: 'SELLER' } });
      }
      return res.json({ user: null });
    }
    
    // Default to User table (CUSTOMER / ADMIN)
    const user = await prisma.user.findUnique({ where: { id } });
    if (user) {
      const { password: _, ...safeUser } = user;
      return res.json({ user: safeUser }); // safeUser already has role from db
    }
    
    return res.json({ user: null });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/me', authMiddleware, async (req: any, res: any) => {
  try {
    const { id, role } = req.user;
    const { stateId, cityId } = req.body;
    
    if (role === 'DELIVERY') {
      // delivery partner logic already handled elsewhere or can be added here
      return res.json({ user: await prisma.deliveryPartner.findUnique({ where: { id } }) });
    }
    
    if (role === 'SELLER') {
      const seller = await prisma.seller.update({
        where: { id },
        data: { stateId, cityId }
      });
      const { password: _, ...safeSeller } = seller;
      return res.json({ user: { ...safeSeller, role: 'SELLER' } });
    }
    
    // Default to User table (CUSTOMER / ADMIN)
    const user = await prisma.user.update({
      where: { id },
      data: { stateId, cityId }
    });
    const { password: _, ...safeUser } = user;
    return res.json({ user: safeUser });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.put('/location', authMiddleware, async (req: any, res: any) => {
  try {
    const { id, role } = req.user;
    const {
      latitude: rawLatitude,
      longitude: rawLongitude,
      accuracy: rawAccuracy,
      city: requestedCity,
      state: requestedState,
    } = req.body;

    const latitude = rawLatitude === undefined || rawLatitude === null
      ? null
      : Number(rawLatitude);

    const longitude = rawLongitude === undefined || rawLongitude === null
      ? null
      : Number(rawLongitude);

    const accuracy = rawAccuracy === undefined || rawAccuracy === null
      ? null
      : Number(rawAccuracy);

    const hasCoordinates =
      latitude !== null &&
      longitude !== null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180;

    const hasNamedLocation = Boolean(requestedCity && requestedState);

    if (!hasCoordinates && !hasNamedLocation) {
      return res.status(400).json({
        error: 'Provide valid latitude/longitude or both city and state.',
      });
    }

    let resolved: GoogleResolvedLocation | null = null;

    // Precise browser coordinates are authoritative for distance ranking.
    if (hasCoordinates) {
      try {
        resolved = await reverseGeocode(latitude!, longitude!);
      } catch (error) {
        // Distance-based recommendations can still work with raw coordinates
        // even when reverse geocoding is temporarily unavailable.
        console.warn('Google reverse geocoding failed; saving raw coordinates only:', error);
        resolved = {
          latitude: latitude!,
          longitude: longitude!,
        };
      }
    } else {
      // Manual profile city/state fallback. Google converts the textual
      // location to coordinates so the seller/user can still participate in
      // precise distance ranking.
      try {
        resolved = await geocodeAddress(`${requestedCity}, ${requestedState}, India`);
      } catch (error) {
        console.warn('Google address geocoding failed:', error);
      }
    }

    const cityName = resolved?.city || requestedCity;
    const stateName = resolved?.state || requestedState;

    let dbState: any = null;
    let dbCity: any = null;

    if (stateName) {
      dbState = await prisma.state.findFirst({
        where: {
          name: {
            equals: String(stateName),
            mode: 'insensitive',
          },
        },
      });
    }

    if (cityName && dbState) {
      dbCity = await prisma.city.findFirst({
        where: {
          name: {
            equals: String(cityName),
            mode: 'insensitive',
          },
          stateId: dbState.id,
        },
      });
    }

    const coordinateLatitude = resolved?.latitude ?? latitude;
    const coordinateLongitude = resolved?.longitude ?? longitude;

    const locationData = {
      latitude: coordinateLatitude ?? undefined,
      longitude: coordinateLongitude ?? undefined,
      locationAccuracy:
        accuracy !== null && Number.isFinite(accuracy)
          ? accuracy
          : undefined,
      locationAddress: resolved?.formattedAddress ?? undefined,
      locationUpdatedAt: new Date(),
      stateId: dbState?.id ?? undefined,
      cityId: dbCity?.id ?? undefined,
    };

    if (role === 'DELIVERY') {
      return res.json({
        user: await prisma.deliveryPartner.findUnique({ where: { id } }),
        location: resolved,
        message: 'Delivery partner location is not used for recommendation scoring.',
      });
    }

    if (role === 'SELLER') {
      const seller = await prisma.seller.update({
        where: { id },
        data: locationData,
      });

      const { password: _, ...safeSeller } = seller;

      return res.json({
        user: { ...safeSeller, role: 'SELLER' },
        location: resolved,
        cityMatched: Boolean(dbCity),
        stateMatched: Boolean(dbState),
        message: 'Seller location updated for nearby-product ranking.',
      });
    }

    // CUSTOMER / ADMIN. CUSTOMER coordinates are consumed by the Python
    // recommendation service on the next recommendation call.
    const user = await prisma.user.update({
      where: { id },
      data: locationData,
    });

    const { password: _, ...safeUser } = user;

    return res.json({
      user: safeUser,
      location: resolved,
      cityMatched: Boolean(dbCity),
      stateMatched: Boolean(dbState),
      message: 'Shopper location updated for nearby-seller recommendations.',
    });
  } catch (error) {
    console.error('Update location error:', error);
    return res.status(500).json({ error: 'Failed to update location' });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const data = req.body;
    
    // Generate a partner ID
    const partnerId = `UDRSP${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Extract phone — always store the sanitized last-10 digits so it
    // matches the login lookup (which compares against slice(-10)).
    const phone = String(data.mobileNumber || data.phone || '').replace(/\D/g, '').slice(-10);
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Check if user exists
    const existing = await prisma.deliveryPartner.findUnique({
      where: { phone }
    });

    if (existing) {
      return res.status(400).json({ error: 'Partner with this phone number already exists' });
    }

    // Create partner
    const newPartner = await prisma.deliveryPartner.create({
      data: {
        partnerId,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        fullName: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        email: data.email || '',
        phone,
        status: 'Pending',
        currentAddress: data.currentAddress || '',
        permanentAddress: data.permanentAddress || '',
        state: data.state || '',
        district: data.district || '',
        city: data.city || '',
        pincode: data.pincode || '',
        emergencyContactName: data.emergencyContactName || '',
        emergencyContactNumber: data.emergencyContactNumber || '',
        vehicleType: data.vehicleType || '',
        vehicleNumber: data.vehicleRegistrationNumber || data.vehicleNumber || '',
        dateOfBirth: data.dateOfBirth || '',
        gender: data.gender || '',
        aadhaarNumber: data.aadhaarNumber || '',
        panNumber: data.panNumber || '',
        drivingLicense: data.drivingLicense || '',
        rcBook: data.rcBook || '',
        vehicleInsurance: data.vehicleInsurance || '',
        bankAccount: data.bankAccount || '',
        ifscCode: data.ifscCode || '',
        upiId: data.upiId || '',
        rating: 0,
        deliveries: 0,
        earnings: 0,
        todayDeliveries: 0,
      }
    });

    // Generate JWT
    const token = jwt.sign({ id: newPartner.id, phone: newPartner.phone, role: 'DELIVERY' }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({ token, user: { ...newPartner, role: 'DELIVERY' } });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

router.post('/login', async (req, res) => {
  // Existing delivery partner login...
  try {
    const { phone } = req.body;
    const rawPhone = String(phone || '').replace(/\D/g, '');
    const cleanPhone = rawPhone.slice(-10);

    if (!cleanPhone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Some accounts were created before phone sanitization, so they may
    // store an 11-digit variant (e.g. '00' + last-10). Match tolerantly:
    // exact sanitized phone, exact raw digits, or any stored value whose
    // last 10 digits equal the sanitized input.
    const partner = await prisma.deliveryPartner.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          { phone: rawPhone },
          { phone: { endsWith: cleanPhone } }
        ]
      },
      // Deterministic pick when two stored phones are suffixes of each other
      orderBy: { createdAt: 'asc' }
    });

    if (!partner) {
      return res.status(404).json({ error: 'Account not found. Please create a new account.' });
    }

    const token = jwt.sign({ id: partner.id, phone: partner.phone, role: 'DELIVERY' }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token, user: { ...partner, role: 'DELIVERY' } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// --- USER AUTHENTICATION ---
import bcrypt from 'bcryptjs';

router.post('/user/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;
    
    if (!email || !password || !firstName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        firstName,
        lastName: lastName || '',
        email,
        phone,
        password: hashedPassword,
        role: req.body.role || 'CUSTOMER',
        stateId: req.body.stateId || null,
        cityId: req.body.cityId || null
      }
    });

    const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
    
    // Omit password from response
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('User signup error:', error);
    res.status(500).json({ error: 'Failed to create user account' });
  }
});

router.post('/user/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// --- SELLER AUTHENTICATION ---

router.post('/seller/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, businessName, gstNumber } = req.body;
    
    if (!email || !password || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingSeller = await prisma.seller.findFirst({
      where: { OR: [{ email }, { phone }] }
    });
    
    if (existingSeller) {
      return res.status(400).json({ error: 'Email or phone already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newSeller = await prisma.seller.create({
      data: {
        firstName,
        lastName: lastName || '',
        email,
        phone,
        password: hashedPassword,
        businessName,
        gstNumber,
        stateId: req.body.stateId || null,
        cityId: req.body.cityId || null,
        bankAccount: req.body.bankAccount || '',
        ifscCode: req.body.ifscCode || '',
        upiId: req.body.upiId || '',
        panNumber: req.body.panNumber || '',
        aadhaarNumber: req.body.aadhaarNumber || '',
        documents: req.body.documents || [],
        status: 'PENDING',
        isNewSeller: true
      }
    });

    const token = jwt.sign({ id: newSeller.id, role: 'SELLER' }, JWT_SECRET, { expiresIn: '7d' });
    
    const { password: _, ...sellerWithoutPassword } = newSeller;
    res.status(201).json({ token, user: { ...sellerWithoutPassword, role: 'SELLER' } });
  } catch (error) {
    console.error('Seller signup error:', error);
    res.status(500).json({ error: 'Failed to create seller account' });
  }
});

router.post('/seller/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const seller = await prisma.seller.findUnique({ where: { email } });
    if (!seller) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, seller.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: seller.id, role: 'SELLER' }, JWT_SECRET, { expiresIn: '7d' });
    
    const { password: _, ...sellerWithoutPassword } = seller;
    res.json({ token, user: { ...sellerWithoutPassword, role: 'SELLER' } });
  } catch (error) {
    console.error('Seller login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

export default router;
