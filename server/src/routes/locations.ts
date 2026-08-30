import express from 'express'
import { prisma } from '../db'
import { haversineDistanceKm } from '../services/googleMaps'

const router = express.Router()

router.get('/states', async (_req, res) => {
  try {
    const states = await prisma.state.findMany({
      orderBy: { name: 'asc' },
    })
    res.json(states)
  } catch (error) {
    console.error('Error fetching states:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

router.get('/cities/:stateId', async (req, res) => {
  try {
    const cities = await prisma.city.findMany({
      where: { stateId: req.params.stateId },
      orderBy: { name: 'asc' },
    })
    res.json(cities)
  } catch (error) {
    console.error('Error fetching cities:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

/**
 * Diagnostic / UI endpoint for nearby sellers.
 *
 * GET /api/locations/nearby-sellers?latitude=24.58&longitude=73.68&radiusKm=100&limit=20
 */
router.get('/nearby-sellers', async (req, res) => {
  try {
    const latitude = Number(req.query.latitude)
    const longitude = Number(req.query.longitude)
    const radiusKm = Math.max(1, Math.min(Number(req.query.radiusKm) || 100, 1000))
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100))

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' })
    }

    const sellers = await prisma.seller.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessName: true,
        rating: true,
        cityId: true,
        stateId: true,
        latitude: true,
        longitude: true,
        locationAddress: true,
      },
    })

    const ranked = sellers
      .map((seller) => ({
        ...seller,
        distanceKm: haversineDistanceKm(
          latitude,
          longitude,
          seller.latitude!,
          seller.longitude!
        ),
      }))
      .filter((seller) => seller.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit)

    return res.json({
      origin: { latitude, longitude },
      radiusKm,
      sellers: ranked.map((seller) => {
        const { latitude: _lat, longitude: _lon, ...publicSeller } = seller

        return {
          ...publicSeller,
          distanceKm: Number(seller.distanceKm.toFixed(2)),
        }
      }),
    })
  } catch (error) {
    console.error('Error fetching nearby sellers:', error)
    return res.status(500).json({ error: 'Failed to fetch nearby sellers.' })
  }
})

export default router
