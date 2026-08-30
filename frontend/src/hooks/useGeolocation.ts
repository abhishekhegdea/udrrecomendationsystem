import { useEffect, useRef } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const LOCATION_SESSION_KEY = 'udrcrafts-location-synced'
const MAX_LOCATION_AGE_MS = 5 * 60 * 1000

export function useGeolocation() {
  const { user } = useAuth()
  const locationFetched = useRef(false)

  useEffect(() => {
    if (!user || locationFetched.current) return

    // Customers provide the shopper location; sellers provide the shop/seller
    // location. Admin/delivery accounts do not participate in recommendation
    // proximity scoring.
    if (user.role !== 'CUSTOMER' && user.role !== 'SELLER') return

    if (sessionStorage.getItem(LOCATION_SESSION_KEY) === user.id) {
      locationFetched.current = true
      return
    }

    if (!('geolocation' in navigator)) {
      console.warn('Browser geolocation is not available.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        locationFetched.current = true

        const token = localStorage.getItem('token')
        if (!token) return

        const { latitude, longitude, accuracy } = position.coords

        try {
          const response = await api.put(
            '/api/auth/location',
            {
              latitude,
              longitude,
              accuracy,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

          sessionStorage.setItem(LOCATION_SESSION_KEY, user.id)

          console.log('Precise location synchronized:', {
            latitude,
            longitude,
            accuracy,
            address: response.data?.location?.formattedAddress,
          })
        } catch (error) {
          // Do not mark the session as synchronized when the backend failed.
          locationFetched.current = false
          console.error('Failed to synchronize location:', error)
        }
      },
      (error) => {
        console.warn('Geolocation permission/error:', error.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: MAX_LOCATION_AGE_MS,
      }
    )
  }, [user])
}
