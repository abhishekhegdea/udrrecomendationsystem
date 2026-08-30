import axios from 'axios'

const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

export interface GoogleResolvedLocation {
  latitude: number
  longitude: number
  formattedAddress?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  placeId?: string
}

function getGoogleMapsApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim()

  if (!key) {
    throw new Error(
      'GOOGLE_MAPS_API_KEY is not configured on the Node server. Enable Google Geocoding API and add the restricted server-side key to server/.env.'
    )
  }

  return key
}

function firstComponent(
  components: Array<{ long_name: string; short_name: string; types: string[] }> | undefined,
  types: string[]
): string | undefined {
  if (!components) return undefined

  for (const type of types) {
    const match = components.find((component) => component.types.includes(type))
    if (match?.long_name) return match.long_name
  }

  return undefined
}

function parseGoogleResult(result: any): GoogleResolvedLocation {
  const location = result?.geometry?.location

  if (
    !location ||
    typeof location.lat !== 'number' ||
    typeof location.lng !== 'number'
  ) {
    throw new Error('Google Geocoding returned a result without valid coordinates.')
  }

  return {
    latitude: location.lat,
    longitude: location.lng,
    formattedAddress: result.formatted_address,
    city: firstComponent(result.address_components, [
      'locality',
      'postal_town',
      'administrative_area_level_2',
      'sublocality_level_1',
    ]),
    state: firstComponent(result.address_components, ['administrative_area_level_1']),
    country: firstComponent(result.address_components, ['country']),
    postalCode: firstComponent(result.address_components, ['postal_code']),
    placeId: result.place_id,
  }
}

function ensureGoogleOk(data: any): void {
  const status = data?.status

  if (status === 'OK') return

  if (status === 'ZERO_RESULTS') {
    throw new Error('Google Geocoding returned ZERO_RESULTS for this location.')
  }

  const message = data?.error_message ? `: ${data.error_message}` : ''
  throw new Error(`Google Geocoding failed with status ${status || 'UNKNOWN'}${message}`)
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GoogleResolvedLocation> {
  const response = await axios.get(GEOCODING_URL, {
    params: {
      latlng: `${latitude},${longitude}`,
      key: getGoogleMapsApiKey(),
    },
    timeout: 7000,
  })

  ensureGoogleOk(response.data)
  return parseGoogleResult(response.data.results[0])
}

export async function geocodeAddress(
  address: string
): Promise<GoogleResolvedLocation> {
  if (!address.trim()) {
    throw new Error('Address is required for geocoding.')
  }

  const response = await axios.get(GEOCODING_URL, {
    params: {
      address,
      key: getGoogleMapsApiKey(),
      region: 'in',
    },
    timeout: 7000,
  })

  ensureGoogleOk(response.data)
  return parseGoogleResult(response.data.results[0])
}

export function haversineDistanceKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
): number {
  const earthRadiusKm = 6371.0088
  const toRadians = (value: number) => (value * Math.PI) / 180

  const lat1 = toRadians(latitude1)
  const lon1 = toRadians(longitude1)
  const lat2 = toRadians(latitude2)
  const lon2 = toRadians(longitude2)

  const dLat = lat2 - lat1
  const dLon = lon2 - lon1

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
  return earthRadiusKm * c
}
