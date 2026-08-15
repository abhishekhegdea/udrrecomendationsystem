import { useEffect, useRef } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export function useGeolocation() {
  const { user } = useAuth();
  const locationFetched = useRef(false);

  useEffect(() => {
    // Only fetch for logged-in customers if we haven't already fetched in this session
    if (!user || user.role !== 'CUSTOMER' || locationFetched.current) return;

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          locationFetched.current = true;
          const { latitude, longitude } = position.coords;
          
          try {
            // Reverse geocoding via Nominatim
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );
            const data = await response.json();
            
            if (data && data.address) {
              const city = data.address.city || data.address.town || data.address.village || data.address.county;
              const state = data.address.state;
              
              if (city && state) {
                // Send to our backend to resolve DB IDs and update user
                await api.put('/auth/location', { city, state });
                console.log(`Location updated: ${city}, ${state}`);
              }
            }
          } catch (error) {
            console.error('Failed to resolve or update location:', error);
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
        }
      );
    }
  }, [user]);
}
